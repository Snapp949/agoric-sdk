import { test as anyTest } from '@agoric/zoe/tools/prepare-test-env-ava.js';

import {
  decodeAddressHook,
  encodeAddressHook,
} from '@agoric/cosmic-proto/address-hooks.js';
import type { NatAmount } from '@agoric/ertp';
import { eventLoopIteration } from '@agoric/internal/src/testing-utils.js';
import { denomHash } from '@agoric/orchestration';
import fetchedChainInfo from '@agoric/orchestration/src/fetched-chain-info.js';
import { type ZoeTools } from '@agoric/orchestration/src/utils/zoe-tools.js';
import { q } from '@endo/errors';
import { Far } from '@endo/pass-style';
import type { TestFn } from 'ava';
import { stringifyWithBigint } from '@agoric/internal';
import { PendingTxStatus } from '../../src/constants.js';
import { prepareAdvancer } from '../../src/exos/advancer.js';
import type { SettlerKit } from '../../src/exos/settler.js';
import { prepareStatusManager } from '../../src/exos/status-manager.js';
import type { LiquidityPoolKit } from '../../src/types.js';
import { makeFeeTools } from '../../src/utils/fees.js';
import { MockCctpTxEvidences, intermediateRecipient } from '../fixtures.js';
import {
  makeTestFeeConfig,
  makeTestLogger,
  prepareMockOrchAccounts,
} from '../mocks.js';
import { commonSetup } from '../supports.js';

const LOCAL_DENOM = `ibc/${denomHash({
  denom: 'uusdc',
  channelId:
    fetchedChainInfo.agoric.connections['noble-1'].transferChannel.channelId,
})}`;

type CommonSetup = Awaited<ReturnType<typeof commonSetup>>;

const createTestExtensions = (t, common: CommonSetup) => {
  const {
    bootstrap: { rootZone, vowTools },
    facadeServices: { chainHub },
    brands: { usdc },
    commonPrivateArgs: { storageNode },
  } = common;

  const { log, inspectLogs } = makeTestLogger(t.log);

  chainHub.registerChain('dydx', fetchedChainInfo.dydx);
  chainHub.registerChain('osmosis', fetchedChainInfo.osmosis);

  const statusManager = prepareStatusManager(
    rootZone.subZone('status-manager'),
    storageNode.makeChildNode('txns'),
  );

  const mockAccounts = prepareMockOrchAccounts(rootZone.subZone('accounts'), {
    vowTools,
    log: t.log,
    usdc,
  });

  const mockZCF = Far('MockZCF', {
    makeEmptySeatKit: () => ({ zcfSeat: Far('MockZCFSeat', {}) }),
  });

  const localTransferVK = vowTools.makeVowKit<void>();
  const resolveLocalTransferV = () => {
    // pretend funds move from tmpSeat to poolAccount
    localTransferVK.resolver.resolve();
  };
  const rejectLocalTransfeferV = () => {
    localTransferVK.resolver.reject(
      new Error('One or more deposits failed: simulated error'),
    );
  };
  const mockZoeTools = Far('MockZoeTools', {
    localTransfer(...args: Parameters<ZoeTools['localTransfer']>) {
      console.log('ZoeTools.localTransfer called with', args);
      return localTransferVK.vow;
    },
  });

  const feeConfig = makeTestFeeConfig(usdc);
  const makeAdvancer = prepareAdvancer(rootZone.subZone('advancer'), {
    chainHub,
    feeConfig,
    localTransfer: mockZoeTools.localTransfer,
    log,
    statusManager,
    usdc: harden({
      brand: usdc.brand,
      denom: LOCAL_DENOM,
    }),
    vowTools,
    // @ts-expect-error mocked zcf
    zcf: mockZCF,
  });

  type NotifyArgs = Parameters<SettlerKit['notify']['notifyAdvancingResult']>;
  const notifyAdvancingResultCalls: NotifyArgs[] = [];
  const mockNotifyF = Far('Settler Notify Facet', {
    notifyAdvancingResult: (...args: NotifyArgs) => {
      console.log('Settler.notifyAdvancingResult called with', args);
      notifyAdvancingResultCalls.push(args);
    },
  });

  const mockBorrowerFacetCalls: {
    borrow: Parameters<LiquidityPoolKit['borrower']['borrow']>[];
    returnToPool: Parameters<LiquidityPoolKit['borrower']['returnToPool']>[];
  } = { borrow: [], returnToPool: [] };

  const mockBorrowerF = Far('LiquidityPool Borrow Facet', {
    borrow: (seat: ZCFSeat, amount: NatAmount) => {
      mockBorrowerFacetCalls.borrow.push([seat, amount]);
    },
    returnToPool: (seat: ZCFSeat, amount: NatAmount) => {
      mockBorrowerFacetCalls.returnToPool.push([seat, amount]);
    },
  });

  const advancer = makeAdvancer({
    borrowerFacet: mockBorrowerF,
    notifyFacet: mockNotifyF,
    poolAccount: mockAccounts.mockPoolAccount.account,
    intermediateRecipient,
  });

  return {
    constants: {
      localDenom: LOCAL_DENOM,
      feeConfig,
    },
    helpers: {
      inspectLogs,
      inspectNotifyCalls: () => harden(notifyAdvancingResultCalls),
      inspectBorrowerFacetCalls: () => harden(mockBorrowerFacetCalls),
    },
    mocks: {
      ...mockAccounts,
      mockNotifyF,
      resolveLocalTransferV,
      rejectLocalTransfeferV,
    },
    services: {
      advancer,
      makeAdvancer,
      statusManager,
      feeTools: makeFeeTools(feeConfig),
    },
  } as const;
};

type TestContext = CommonSetup & {
  extensions: ReturnType<typeof createTestExtensions>;
};

const test = anyTest as TestFn<TestContext>;

test.beforeEach(async t => {
  const common = await commonSetup(t);
  t.context = {
    ...common,
    extensions: createTestExtensions(t, common),
  };
});

test('updates status to ADVANCING in happy path', async t => {
  const {
    extensions: {
      services: { advancer, feeTools, statusManager },
      helpers: { inspectLogs, inspectNotifyCalls },
      mocks: { mockPoolAccount, resolveLocalTransferV },
    },
    brands: { usdc },
    bootstrap: { storage },
  } = t.context;

  const mockEvidence = MockCctpTxEvidences.AGORIC_PLUS_OSMO();
  void advancer.handleTransactionEvent(mockEvidence);

  // pretend borrow succeeded and funds were depositing to the LCA
  resolveLocalTransferV();
  // pretend the IBC Transfer settled
  mockPoolAccount.transferVResolver.resolve();
  // wait for handleTransactionEvent to do work
  await eventLoopIteration();

  t.deepEqual(
    storage.getValues(`fun.txns.${mockEvidence.txHash}`),
    [stringifyWithBigint(mockEvidence), PendingTxStatus.Advancing],
    'ADVANCED status in happy path',
  );

  t.deepEqual(inspectLogs(), [
    ['decoded EUD: osmo183dejcnmkka5dzcu9xw6mywq0p2m5peks28men'],
    [
      'Advance transfer fulfilled',
      {
        advanceAmount: {
          brand: usdc.brand,
          value: 146999999n,
        },
        destination: {
          chainId: 'osmosis-1',
          encoding: 'bech32',
          value: 'osmo183dejcnmkka5dzcu9xw6mywq0p2m5peks28men',
        },
        result: undefined,
      },
    ],
  ]);

  // We expect to see an `Advanced` update, but that is now Settler's job.
  // but we can ensure it's called
  t.like(inspectNotifyCalls(), [
    [
      {
        txHash: mockEvidence.txHash,
        forwardingAddress: mockEvidence.tx.forwardingAddress,
        fullAmount: usdc.make(mockEvidence.tx.amount),
        destination: {
          value: decodeAddressHook(mockEvidence.aux.recipientAddress).query.EUD,
        },
      },
      true, // indicates transfer succeeded
    ],
  ]);
});

test('updates status to OBSERVED on insufficient pool funds', async t => {
  const {
    brands: { usdc },
    bootstrap: { storage },
    extensions: {
      services: { makeAdvancer, statusManager },
      helpers: { inspectLogs },
      mocks: { mockPoolAccount, mockNotifyF },
    },
  } = t.context;

  const mockBorrowerFacet = Far('LiquidityPool Borrow Facet', {
    borrow: (seat: ZCFSeat, amount: NatAmount) => {
      throw new Error(
        `Cannot borrow. Requested ${q(amount)} must be less than pool balance ${q(usdc.make(1n))}.`,
      );
    },
    returnToPool: () => {}, // not expecting this to be called
  });

  // make a new advancer that intentionally throws
  const advancer = makeAdvancer({
    borrowerFacet: mockBorrowerFacet,
    notifyFacet: mockNotifyF,
    poolAccount: mockPoolAccount.account,
    intermediateRecipient,
  });

  const mockEvidence = MockCctpTxEvidences.AGORIC_PLUS_DYDX();
  void advancer.handleTransactionEvent(mockEvidence);
  await eventLoopIteration();

  t.deepEqual(
    storage.getValues(`fun.txns.${mockEvidence.txHash}`),
    [stringifyWithBigint(mockEvidence), PendingTxStatus.Observed],
    'OBSERVED status on insufficient pool funds',
  );

  t.deepEqual(inspectLogs(), [
    ['decoded EUD: dydx183dejcnmkka5dzcu9xw6mywq0p2m5peks28men'],
    [
      'Advancer error:',
      Error(
        `Cannot borrow. Requested ${q(usdc.make(294999999n))} must be less than pool balance ${q(usdc.make(1n))}.`,
      ),
    ],
  ]);
});

test('updates status to OBSERVED if makeChainAddress fails', async t => {
  const {
    bootstrap: { storage },
    extensions: {
      services: { advancer, statusManager },
      helpers: { inspectLogs },
    },
  } = t.context;

  const mockEvidence = MockCctpTxEvidences.AGORIC_UNKNOWN_EUD();
  await advancer.handleTransactionEvent(mockEvidence);

  t.deepEqual(
    storage.getValues(`fun.txns.${mockEvidence.txHash}`),
    [stringifyWithBigint(mockEvidence), PendingTxStatus.Observed],
    'OBSERVED status on makeChainAddress failure',
  );

  t.deepEqual(inspectLogs(), [
    ['decoded EUD: random1addr'],
    [
      'Advancer error:',
      Error('Chain info not found for bech32Prefix "random"'),
    ],
  ]);
});

test('calls notifyAdvancingResult (AdvancedFailed) on failed transfer', async t => {
  const {
    bootstrap: { storage },
    extensions: {
      services: { advancer, feeTools, statusManager },
      helpers: { inspectLogs, inspectNotifyCalls },
      mocks: { mockPoolAccount, resolveLocalTransferV },
    },
    brands: { usdc },
  } = t.context;

  const mockEvidence = MockCctpTxEvidences.AGORIC_PLUS_DYDX();
  void advancer.handleTransactionEvent(mockEvidence);

  // pretend borrow and deposit to LCA succeed
  resolveLocalTransferV();
  await eventLoopIteration();

  t.deepEqual(
    storage.getValues(`fun.txns.${mockEvidence.txHash}`),
    [stringifyWithBigint(mockEvidence), PendingTxStatus.Advancing],
    'tx is Advancing',
  );

  mockPoolAccount.transferVResolver.reject(new Error('simulated error'));
  await eventLoopIteration();

  t.deepEqual(inspectLogs(), [
    ['decoded EUD: dydx183dejcnmkka5dzcu9xw6mywq0p2m5peks28men'],
    ['Advance transfer rejected', Error('simulated error')],
  ]);

  // We expect to see an `AdvancedFailed` update, but that is now Settler's job.
  // but we can ensure it's called
  t.like(inspectNotifyCalls(), [
    [
      {
        txHash: mockEvidence.txHash,
        forwardingAddress: mockEvidence.tx.forwardingAddress,
        fullAmount: usdc.make(mockEvidence.tx.amount),
        advanceAmount: feeTools.calculateAdvance(
          usdc.make(mockEvidence.tx.amount),
        ),
        destination: {
          value: decodeAddressHook(mockEvidence.aux.recipientAddress).query.EUD,
        },
      },
      false, // this indicates transfer failed
    ],
  ]);
});

test('updates status to OBSERVED if pre-condition checks fail', async t => {
  const {
    bootstrap: { storage },
    extensions: {
      services: { advancer, statusManager },
      helpers: { inspectLogs },
    },
  } = t.context;

  const mockEvidence = MockCctpTxEvidences.AGORIC_NO_PARAMS();

  await advancer.handleTransactionEvent(mockEvidence);

  t.deepEqual(
    storage.getValues(`fun.txns.${mockEvidence.txHash}`),
    [stringifyWithBigint(mockEvidence), PendingTxStatus.Observed],
    'tx is recorded as OBSERVED',
  );

  t.deepEqual(inspectLogs(), [
    [
      'Advancer error:',
      Error('query: {} - Must have missing properties ["EUD"]'),
    ],
  ]);

  await advancer.handleTransactionEvent({
    ...MockCctpTxEvidences.AGORIC_NO_PARAMS(
      encodeAddressHook(
        'agoric16kv2g7snfc4q24vg3pjdlnnqgngtjpwtetd2h689nz09lcklvh5s8u37ek',
        { EUD: 'osmo1234', extra: 'value' },
      ),
    ),
    txHash:
      '0xc81bc6105b60a234c7c50ac17816ebcd5561d366df8bf3be59ff387552761799',
  });

  const [, ...remainingLogs] = inspectLogs();
  t.deepEqual(remainingLogs, [
    [
      'Advancer error:',
      Error(
        'query: {"EUD":"osmo1234","extra":"value"} - Must not have unexpected properties: ["extra"]',
      ),
    ],
  ]);
});

test('will not advance same txHash:chainId evidence twice', async t => {
  const {
    extensions: {
      services: { advancer },
      helpers: { inspectLogs },
      mocks: { mockPoolAccount, resolveLocalTransferV },
    },
    brands: { usdc },
  } = t.context;

  const mockEvidence = MockCctpTxEvidences.AGORIC_PLUS_OSMO();

  // First attempt
  void advancer.handleTransactionEvent(mockEvidence);
  resolveLocalTransferV();
  mockPoolAccount.transferVResolver.resolve();
  await eventLoopIteration();

  t.deepEqual(inspectLogs(), [
    ['decoded EUD: osmo183dejcnmkka5dzcu9xw6mywq0p2m5peks28men'],
    [
      'Advance transfer fulfilled',
      {
        advanceAmount: { brand: usdc.brand, value: 146999999n },
        destination: {
          chainId: 'osmosis-1',
          encoding: 'bech32',
          value: 'osmo183dejcnmkka5dzcu9xw6mywq0p2m5peks28men',
        },
        result: undefined,
      },
    ],
  ]);

  // Second attempt
  void advancer.handleTransactionEvent(mockEvidence);
  await eventLoopIteration();
  const [, , ...remainingLogs] = inspectLogs();
  t.deepEqual(remainingLogs, [
    [
      'txHash already seen:',
      '0xc81bc6105b60a234c7c50ac17816ebcd5561d366df8bf3be59ff387552761702',
    ],
  ]);
});

test('returns payment to LP if zoeTools.localTransfer fails', async t => {
  const {
    extensions: {
      services: { advancer },
      helpers: { inspectLogs, inspectBorrowerFacetCalls, inspectNotifyCalls },
      mocks: { rejectLocalTransfeferV },
    },
    brands: { usdc },
  } = t.context;
  const mockEvidence = MockCctpTxEvidences.AGORIC_PLUS_OSMO();

  void advancer.handleTransactionEvent(mockEvidence);
  rejectLocalTransfeferV();

  await eventLoopIteration();

  t.deepEqual(
    inspectLogs(),
    [
      ['decoded EUD: osmo183dejcnmkka5dzcu9xw6mywq0p2m5peks28men'],
      [
        '⚠️ deposit to localOrchAccount failed, attempting to return payment to LP',
        Error('One or more deposits failed: simulated error'),
      ],
    ],
    'contract logs report error',
  );

  const { borrow, returnToPool } = inspectBorrowerFacetCalls();

  const expectedArguments = [
    Far('MockZCFSeat', {}),
    usdc.make(146999999n), // net of fees
  ];

  t.is(borrow.length, 1, 'borrow is called before zt.localTransfer fails');
  t.deepEqual(borrow[0], expectedArguments, 'borrow arguments match expected');

  t.is(
    returnToPool.length,
    1,
    'returnToPool is called after zt.localTransfer fails',
  );
  t.deepEqual(
    returnToPool[0],
    expectedArguments,
    'same amount borrowed is returned to LP',
  );

  t.like(
    inspectNotifyCalls(),
    [
      [
        {
          txHash: mockEvidence.txHash,
          forwardingAddress: mockEvidence.tx.forwardingAddress,
        },
        false, // indicates advance failed
      ],
    ],
    'Advancing tx is recorded as AdvanceFailed',
  );
});

test('alerts if `returnToPool` fallback fails', async t => {
  const {
    brands: { usdc },
    extensions: {
      services: { makeAdvancer },
      helpers: { inspectLogs, inspectNotifyCalls },
      mocks: { mockPoolAccount, mockNotifyF, rejectLocalTransfeferV },
    },
  } = t.context;

  const mockBorrowerFacet = Far('LiquidityPool Borrow Facet', {
    borrow: (seat: ZCFSeat, amount: NatAmount) => {
      // note: will not be tracked by `inspectBorrowerFacetCalls`
    },
    returnToPool: (seat: ZCFSeat, amount: NatAmount) => {
      throw new Error(
        `⚠️ borrowSeatAllocation ${q({ USDC: usdc.make(0n) })} less than amountKWR ${q(amount)}`,
      );
    },
  });

  // make a new advancer that intentionally throws during returnToPool
  const advancer = makeAdvancer({
    borrowerFacet: mockBorrowerFacet,
    notifyFacet: mockNotifyF,
    poolAccount: mockPoolAccount.account,
    intermediateRecipient,
  });

  const mockEvidence = MockCctpTxEvidences.AGORIC_PLUS_OSMO();
  void advancer.handleTransactionEvent(mockEvidence);
  rejectLocalTransfeferV();

  await eventLoopIteration();

  t.deepEqual(inspectLogs(), [
    ['decoded EUD: osmo183dejcnmkka5dzcu9xw6mywq0p2m5peks28men'],
    [
      '⚠️ deposit to localOrchAccount failed, attempting to return payment to LP',
      Error('One or more deposits failed: simulated error'),
    ],
    [
      '🚨 deposit to localOrchAccount failure recovery failed',
      Error(
        `⚠️ borrowSeatAllocation ${q({ USDC: usdc.make(0n) })} less than amountKWR ${q(usdc.make(146999999n))}`,
      ),
    ],
  ]);

  await eventLoopIteration();

  t.like(
    inspectNotifyCalls(),
    [
      [
        {
          txHash: mockEvidence.txHash,
          forwardingAddress: mockEvidence.tx.forwardingAddress,
        },
        false, // indicates advance failed
      ],
    ],
    'Advancing tx is recorded as AdvanceFailed',
  );
});

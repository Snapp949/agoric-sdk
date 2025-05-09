import type { HostInterface } from '@agoric/async-flow';
import type {
  ChainAddress,
  DenomAmount,
  OrchestrationAccount,
} from '@agoric/orchestration';
import type { Zone } from '@agoric/zone';
import type { VowTools } from '@agoric/vow';
import { makeRatio } from '@agoric/zoe/src/contractSupport/ratio.js';
import type {
  AmountUtils,
  withAmountUtils,
} from '@agoric/zoe/tools/test-utils.js';
import type { FeeConfig, LogFn } from '../src/types.js';

export const prepareMockOrchAccounts = (
  zone: Zone,
  {
    vowTools: { makeVowKit, asVow },
    log,
    usdc,
  }: {
    vowTools: VowTools;
    log: (...args: any[]) => void;
    usdc: { brand: Brand<'nat'>; issuer: Issuer<'nat'> };
  },
) => {
  // each can only be resolved/rejected once per test
  const poolAccountTransferVK = makeVowKit<undefined>();

  const mockedPoolAccount = zone.exo('Mock Pool LocalOrchAccount', undefined, {
    transfer(destination: ChainAddress, amount: DenomAmount) {
      log('PoolAccount.transfer() called with', destination, amount);
      return poolAccountTransferVK.vow;
    },
    deposit(payment: Payment<'nat'>) {
      log('PoolAccount.deposit() called with', payment);
      // XXX consider a mock for deposit failure
      return asVow(async () => usdc.issuer.getAmountOf(payment));
    },
  });

  const poolAccount = mockedPoolAccount as unknown as HostInterface<
    OrchestrationAccount<{ chainId: 'agoric' }>
  >;

  const settlementCallLog = [] as any[];
  const settlementAccountMock = zone.exo('Mock Settlement Account', undefined, {
    transfer(...args) {
      settlementCallLog.push(harden(['transfer', ...args]));
    },
  });
  const settlementAccount = settlementAccountMock as unknown as HostInterface<
    OrchestrationAccount<{ chainId: 'agoric' }>
  >;
  return {
    mockPoolAccount: {
      account: poolAccount,
      transferVResolver: poolAccountTransferVK.resolver,
    },
    settlement: {
      account: settlementAccount,
      callLog: settlementCallLog,
    },
  };
};

export const makeTestLogger = (logger: LogFn) => {
  const logs: unknown[][] = [];
  const log = (...args: any[]) => {
    logs.push(args);
    logger(args);
  };
  const inspectLogs = (index?: number) =>
    typeof index === 'number' ? logs[index] : logs;
  return { log, inspectLogs };
};

export type TestLogger = ReturnType<typeof makeTestLogger>;

export const makeTestFeeConfig = (usdc: Omit<AmountUtils, 'mint'>): FeeConfig =>
  harden({
    flat: usdc.make(1n),
    variableRate: makeRatio(2n, usdc.brand),
    maxVariable: usdc.units(5),
    contractRate: makeRatio(20n, usdc.brand),
  });

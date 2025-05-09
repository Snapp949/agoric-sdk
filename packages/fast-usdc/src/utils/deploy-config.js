import { denomHash, withChainCapabilities } from '@agoric/orchestration';
import fetchedChainInfo from '@agoric/orchestration/src/fetched-chain-info.js';

/**
 * @import {FastUSDCConfig} from '@agoric/fast-usdc/src/types.js'
 * @import {Passable} from '@endo/marshal';
 * @import {CosmosChainInfo, Denom, DenomDetail} from '@agoric/orchestration';
 */

/** @type {[Denom, DenomDetail & { brandKey?: string}][]} */
export const defaultAssetInfo = [
  [
    'uusdc',
    {
      baseName: 'noble',
      chainName: 'noble',
      baseDenom: 'uusdc',
    },
  ],
  [
    `ibc/${denomHash({ denom: 'uusdc', channelId: fetchedChainInfo.agoric.connections['noble-1'].transferChannel.channelId })}`,
    {
      baseName: 'noble',
      chainName: 'agoric',
      baseDenom: 'uusdc',
      brandKey: 'USDC',
    },
  ],
  [
    `ibc/${denomHash({ denom: 'uusdc', channelId: fetchedChainInfo.osmosis.connections['noble-1'].transferChannel.channelId })}`,
    {
      baseName: 'noble',
      chainName: 'osmosis',
      baseDenom: 'uusdc',
    },
  ],
];
harden(defaultAssetInfo);

const agoricAssetInfo = defaultAssetInfo.filter(
  ([_d, i]) => i.chainName === 'agoric',
);

/**
 * @type {Record<string, Pick<FastUSDCConfig, 'oracles' | 'feedPolicy' | 'chainInfo' | 'assetInfo' >>}
 *
 * TODO: determine OCW operator addresses
 * meanwhile, use price oracle addresses (from updatePriceFeeds.js).
 */
export const configurations = {
  /**
   * NOTE: The a3p-integration runtime does _not_ include
   * a noble chain; this limits functionality to advancing
   * to the Agoric chain.
   */
  A3P_INTEGRATION: {
    oracles: {
      gov1: 'agoric1ee9hr0jyrxhy999y755mp862ljgycmwyp4pl7q',
      gov2: 'agoric1wrfh296eu2z34p6pah7q04jjuyj3mxu9v98277',
      gov3: 'agoric1ydzxwh6f893jvpaslmaz6l8j2ulup9a7x8qvvq',
    },
    feedPolicy: {
      nobleAgoricChannelId: 'channel-does-not-exist',
      nobleDomainId: 4,
      chainPolicies: {
        Arbitrum: {
          attenuatedCttpBridgeAddress:
            '0xe298b93ffB5eA1FB628e0C0D55A43aeaC268e347',
          cctpTokenMessengerAddress:
            '0x19330d10D9Cc8751218eaf51E8885D058642E08A',
          chainId: 42161,
          confirmations: 2,
        },
      },
    },
    chainInfo: /** @type {Record<string, CosmosChainInfo & Passable>} */ (
      withChainCapabilities({
        agoric: fetchedChainInfo.agoric,
        // registering USDC-on-agoric requires registering the noble chain
        noble: fetchedChainInfo.noble,
      })
    ),
    assetInfo: agoricAssetInfo,
  },
  MAINNET: {
    oracles: {
      '01node': 'agoric19uscwxdac6cf6z7d5e26e0jm0lgwstc47cpll8',
      'Simply Staking': 'agoric1krunjcqfrf7la48zrvdfeeqtls5r00ep68mzkr',
      P2P: 'agoric1n4fcxsnkxe4gj6e24naec99hzmc4pjfdccy5nj',
    },
    feedPolicy: {
      nobleAgoricChannelId: 'channel-21',
      nobleDomainId: 4,
      chainPolicies: {
        Arbitrum: {
          attenuatedCttpBridgeAddress:
            '0xe298b93ffB5eA1FB628e0C0D55A43aeaC268e347',
          cctpTokenMessengerAddress:
            '0x19330d10D9Cc8751218eaf51E8885D058642E08A',
          chainId: 42161,
          confirmations: 2,
        },
      },
    },
    chainInfo: /** @type {Record<string, CosmosChainInfo & Passable>} */ (
      withChainCapabilities(fetchedChainInfo)
    ),
    assetInfo: defaultAssetInfo,
  },
  DEVNET: {
    oracles: {
      DSRV: 'agoric1lw4e4aas9q84tq0q92j85rwjjjapf8dmnllnft',
      Stakin: 'agoric1zj6vrrrjq4gsyr9lw7dplv4vyejg3p8j2urm82',
      '01node': 'agoric1ra0g6crtsy6r3qnpu7ruvm7qd4wjnznyzg5nu4',
      'Simply Staking': 'agoric1qj07c7vfk3knqdral0sej7fa6eavkdn8vd8etf',
      P2P: 'agoric10vjkvkmpp9e356xeh6qqlhrny2htyzp8hf88fk',
    },
    feedPolicy: {
      nobleAgoricChannelId: 'TODO',
      nobleDomainId: 4,
      chainPolicies: {
        Arbitrum: {
          attenuatedCttpBridgeAddress: '0xTODO',
          cctpTokenMessengerAddress: '0xTODO',
          chainId: 421614,
          confirmations: 2,
        },
      },
    },
    chainInfo: /** @type {Record<string, CosmosChainInfo & Passable>} */ (
      withChainCapabilities(fetchedChainInfo) // TODO: use devnet values
    ),
    assetInfo: defaultAssetInfo, // TODO: use emerynet values
  },
  EMERYNET: {
    oracles: {
      gov1: 'agoric1ldmtatp24qlllgxmrsjzcpe20fvlkp448zcuce',
      gov2: 'agoric140dmkrz2e42ergjj7gyvejhzmjzurvqeq82ang',
    },
    feedPolicy: {
      nobleAgoricChannelId: 'TODO',
      nobleDomainId: 4,
      chainPolicies: {
        Arbitrum: {
          attenuatedCttpBridgeAddress: '0xTODO',
          cctpTokenMessengerAddress: '0xTODO',
          chainId: 421614,
          confirmations: 2,
        },
      },
    },
    chainInfo: /** @type {Record<string, CosmosChainInfo & Passable>} */ (
      withChainCapabilities(fetchedChainInfo) // TODO: use emerynet values
    ),
    assetInfo: defaultAssetInfo, // TODO: use emerynet values
  },
};
harden(configurations);

// Constraints on the configurations
const MAINNET_EXPECTED_ORACLES = 3;
assert(
  new Set(Object.values(configurations.MAINNET.oracles)).size ===
    MAINNET_EXPECTED_ORACLES,
  `Mainnet must have exactly ${MAINNET_EXPECTED_ORACLES} oracles`,
);

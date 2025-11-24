import { bench } from '../src/benchmarkerator.js';

// eslint-disable-next-line import/order
import { Offers } from '@agoric/inter-protocol/src/clientSupport.js';

const collateralBrandKey = 'ATOM';

/**
 * Stress test for vault operations
 * This benchmark measures the performance of opening multiple vaults
 */

const setup = async context => {
  const { alice } = context.actors;

  // Ensure alice's wallet is initialized
  alice.getLatestUpdateRecord();

  return {
    vaultsToOpen: Number(context.options.vaults || 10),
  };
};

const executeRound = async (context, round) => {
  const { alice } = context.actors;
  const { vaultsToOpen } = context.config;

  const openVault = async i => {
    const offerId = `stress-vault-${round}-${i}`;
    await alice.executeOfferMaker(Offers.vaults.OpenVault, {
      offerId,
      collateralBrandKey,
      wantMinted: 5,
      giveCollateral: 1.0,
    });

    const upd = alice.getLatestUpdateRecord();
    assert(
      upd.updated === 'offerStatus' &&
        upd.status.id === offerId &&
        upd.status.numWantsSatisfied === 1,
    );
  };

  const range = [...Array(vaultsToOpen)].map((_, i) => i + 1);
  await Promise.all(range.map(i => openVault(i)));
};

bench.addBenchmark('stress vaults', {
  setup,
  executeRound,
  rounds: 1,
});

await bench.run();

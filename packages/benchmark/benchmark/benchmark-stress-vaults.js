import { bench } from '../src/benchmarkerator.js';

// eslint-disable-next-line import/order
import { Offers } from '@agoric/inter-protocol/src/clientSupport.js';

const collateralBrandKey = 'ATOM';

bench.addBenchmark('stress vaults', {
  executeRound: async (context, round) => {
    const { alice, bob, carol } = context.actors;

    const openVault = async (actor, i, n, r) => {
      const offerId = `stress-vault-${actor.constructor.name}-${i}-of-${n}-round-${r}`;
      await actor.executeOfferMaker(Offers.vaults.OpenVault, {
        offerId,
        collateralBrandKey,
        wantMinted: 5,
        giveCollateral: 1.0,
      });

      const upd = actor.getLatestUpdateRecord();
      assert(
        upd.updated === 'offerStatus' &&
          upd.status.id === offerId &&
          upd.status.numWantsSatisfied === 1,
      );
    };

    const openN = async (actor, n) => {
      const range = [...Array(n)].map((_, i) => i + 1);
      await Promise.all(range.map(i => openVault(actor, i, n, round)));
    };

    const roundSize = context.options.size ? Number(context.options.size) : 3;
    await Promise.all([
      openN(alice, roundSize),
      openN(bob, roundSize),
      openN(carol, roundSize),
    ]);
  },
});

await bench.run();

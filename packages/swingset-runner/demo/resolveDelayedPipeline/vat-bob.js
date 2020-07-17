/* global harden */

const log = console.log;

export function buildRootObject(_vatPowers) {
  const thing = {
    answer() {
      log('=> Bob: in thing.answer1(), reply with string');
      return `Bob's thing answer`;
    },
  };
  return harden({
    getThing() {
      log('=> Bob: in getThing(), reply with thing');
      return thing;
    },
  });
}

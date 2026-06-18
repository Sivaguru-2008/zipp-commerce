// Mongo transaction helper.
//
// Transactions require a replica set (Atlas, or `mongod --replSet`). On a
// standalone dev instance we degrade to a "fake" session that just runs the
// callback without atomicity — so dev / CI never crash with
// "Transaction numbers are only allowed on a replica set member or mongos".
//
// Use withTransaction() like:
//   const result = await withTransaction(async (session) => {
//     await Foo.create([{ ... }], { session });
//     ...
//     return value;
//   });

const mongoose = require('mongoose');
const logger = require('./logger');

let txSupported = null;  // tri-state: null=unknown, true=replicaset, false=standalone

async function detectSupport() {
  if (txSupported !== null) return txSupported;
  try {
    const admin = mongoose.connection.db.admin();
    const info = await admin.command({ hello: 1 });
    // hello.setName is only present on replica-set members; mongos has msg='isdbgrid'.
    txSupported = !!(info.setName || info.msg === 'isdbgrid');
    if (!txSupported) {
      logger.warn('Mongo deployment is standalone — transactions disabled. Order safety degrades to non-atomic best-effort.');
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Could not detect Mongo deployment type; assuming standalone');
    txSupported = false;
  }
  return txSupported;
}

async function withTransaction(fn) {
  await detectSupport();
  if (!txSupported) {
    // No transaction available — execute without one. Caller is responsible
    // for the manual rollback paths already in place (delete order if stock
    // depletes, etc.). This branch only runs on dev/standalone.
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    }, {
      // Mongo's default read concern for txs is local; majority is safer for
      // ordering / payment-style data.
      readConcern:  { level: 'majority' },
      writeConcern: { w: 'majority' }
    });
    return result;
  } finally {
    session.endSession();
  }
}

module.exports = { withTransaction, isSupported: () => txSupported === true };

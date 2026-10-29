'use strict';

function assertPayMongoTestKey(value) {
  if (typeof value !== 'string' || !/^sk_test_[A-Za-z0-9]+$/.test(value)) {
    throw new Error('Refusing provider verification: PAYMONGO_SECRET_KEY must be a PayMongo test-mode key.');
  }
  return true;
}

module.exports = { assertPayMongoTestKey };

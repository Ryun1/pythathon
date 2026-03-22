use aiken/collection/list
use aiken/math/rational.{Rational}
use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use pyth
use types/u32

/// Reads the ADA/USD price from a Pyth Lazer price update.
/// Feed ID 16 = ADA/USD.
fn read_ada_usd_price(pyth_id: PolicyId, self: Transaction) -> Rational {
  expect [update] = pyth.get_updates(pyth_id, self)
  expect Some(feed) =
    list.find(update.feeds, fn(feed) { u32.as_int(feed.feed_id) == 16 })
  expect Some(Some(price)) = feed.price
  expect Some(exponent) = feed.exponent
  expect Some(multiplier) = rational.from_int(10) |> rational.pow(exponent)

  rational.from_int(price) |> rational.mul(multiplier)
}

/// Example spend validator that uses Pyth Lazer price data.
/// The pyth_id parameter is the PolicyId of the Pyth state NFT.
validator pythathon(pyth_id: PolicyId) {
  spend(_datum: Option<Data>, _redeemer: Data, _utxo: OutputReference, self: Transaction) {
    let price = read_ada_usd_price(pyth_id, self)
    // Example: require ADA/USD price is positive
    expect Some(zero) = rational.new(0, 1)
    rational.compare(price, zero) == Greater
  }

  else(_) {
    fail
  }
}

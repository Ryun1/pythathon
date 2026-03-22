use cardano/transaction.{Transaction}

validator meme_nft {
  mint(_redeemer: Data, _policy_id: ByteArray, self: Transaction) {
    True
  }

  else(_) {
    fail
  }
}

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { ProviderOnlyClient } from "@evolution-sdk/evolution";
import {
  Address,
  Assets,
  Data,
  InlineDatum,
  createClient,
  ScriptHash,
  TransactionHash,
} from "@evolution-sdk/evolution";
import * as Label from "@evolution-sdk/evolution/Assets/Label";
import { Codec as CIP68Codec } from "@evolution-sdk/evolution/plutus/CIP68Metadata";
import { PlutusV3 } from "@evolution-sdk/evolution/PlutusV3";
import type { NetworkId } from "@evolution-sdk/evolution/sdk/client/Client";
import { PythLazerClient } from "@pythnetwork/pyth-lazer-sdk";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getPythScriptHash, getPythState } from "@pythnetwork/pyth-lazer-cardano-js";

export type Network = Exclude<NetworkId, number>;

export type Provider =
  | { type: "blockfrost"; projectId: string }
  | { type: "koios"; token?: string }
  | { type: "maestro"; apiKey: string };

function resolveBaseUrl(network: Network, provider: Provider): string {
  switch (provider.type) {
    case "blockfrost":
      return `https://cardano-${network}.blockfrost.io/api/v0`;
    case "koios":
      return `https://${{ mainnet: "api", preprod: "preprod", preview: "preview" }[network]}.koios.rest/api/v1`;
    case "maestro":
      return `https://${network}.gomaestro-api.org/v1`;
  }
}

export function createEvolutionClient(
  network: Network,
  provider: Provider,
): ProviderOnlyClient {
  return createClient({
    network,
    provider: { ...provider, baseUrl: resolveBaseUrl(network, provider) },
  });
}

const {
  network,
  policyId: POLICY_ID,
  lazerToken: LAZER_TOKEN,
  provider: providerType,
  providerToken,
} = await yargs(hideBin(process.argv))
  .option("network", {
    choices: ["mainnet", "preprod", "preview"] as const,
    default: "preprod" as const,
    description: "Cardano network name, e.g. 'preprod'",
  })
  .option("policy-id", {
    demandOption: true,
    description: "Hex-encoded policy ID of the Cardano Pyth deployment",
    type: "string",
  })
  .option("lazer-token", {
    demandOption: true,
    description: "Lazer authentication token",
    type: "string",
  })
  .option("provider", {
    choices: ["blockfrost", "koios", "maestro"] as const,
    default: "koios" as const,
    description: "Cardano data provider used by Evolution SDK",
  })
  .option("provider-token", {
    description:
      "Provider credential. Required for Blockfrost and Maestro, optional for Koios.",
    type: "string",
  })
  .help()
  .parseAsync();

let provider: Provider;
switch (providerType) {
  case "blockfrost": {
    if (!providerToken) throw new Error("missing --provider-token");
    provider = { projectId: providerToken, type: providerType };
    break;
  }
  case "koios": {
    provider = {
      type: providerType,
      ...(providerToken ? { token: providerToken } : {}),
    };
    break;
  }
  case "maestro": {
    if (!providerToken) throw new Error("missing --provider-token");
    provider = { apiKey: providerToken, type: providerType };
    break;
  }
}

// 1. Fetch the price update from Pyth Lazer in "solana" format (little-endian,
//    Ed25519-signed -- used for both Cardano and Solana):
const lazer = await PythLazerClient.create({
  token: LAZER_TOKEN,
  webSocketPoolConfig: {},
});
const latestPrice = await lazer.getLatestPrice({
  channel: "fixed_rate@200ms",
  formats: ["solana"],
  parsed: true,
  jsonBinaryEncoding: "hex",
  priceFeedIds: [16],
  properties: ["price", "bestBidPrice", "bestAskPrice", "exponent"],
});

if (!latestPrice.solana?.data) {
  throw new Error("Missing update payload");
}

const update = Buffer.from(latestPrice.solana.data, "hex");
console.log("Fetched update bytes:", update.toString("hex"));

// 2. Resolve the active Pyth State UTxO and withdraw script hash from on-chain state.
if (!process.env.CARDANO_MNEMONIC) {
  throw new Error("CARDANO_MNEMONIC environment variable not set");
}
const client = createEvolutionClient(network, provider);

const pythState = await getPythState(POLICY_ID, client);
const pythScript = getPythScriptHash(pythState);
console.log("Active withdraw script hash:", pythScript);

// 3. Include Pyth State UTxO as a reference input and trigger 0-withdrawal on
//    the verification script with the price update as a redeemer.
const wallet = client.attachWallet({
  mnemonic: process.env.CARDANO_MNEMONIC,
  type: "seed",
});

const now = BigInt(Date.now());
const tx = wallet
  .newTx()
  .setValidity({ from: now - 60_000n, to: now + 60_000n })
  .readFrom({ referenceInputs: [pythState] })
  .withdraw({
    amount: 0n,
    redeemer: [update],
    stakeCredential: ScriptHash.fromHex(pythScript),
  });

// 4. Determine price mood and generate meme, then attach as CIP-20 metadata.
const feed = latestPrice.parsed?.priceFeeds?.[0];
if (!feed) {
  throw new Error("Missing parsed price feed data");
}
const price = Number(feed.price ?? 0) * 10 ** (feed.exponent ?? 0);

function memeEncode(text: string): string {
  return text
    .replace(/-/g, "--")
    .replace(/_/g, "__")
    .replace(/\?/g, "~q")
    .replace(/"/g, "~e")
    .replace(/#/g, "~h")
    .replace(/\//g, "~s")
    .replace(/\$/g, "~d")
    .replace(/ /g, "_");
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getMood(price: number) {
  const priceStr = `$${price.toFixed(2)}`;

  const bearishTemplates = [
    "sadfrog", "disastergirl", "sad-biden", "harold", "drowning",
    "fine", "gone", "blb", "facepalm", "elmo",
  ];
  const bearishTexts = [
    { topText: `ADA at ${priceStr}`, bottomText: "pain." },
    { topText: `ADA at ${priceStr}`, bottomText: "this is fine" },
    { topText: "me checking my portfolio", bottomText: `ADA at ${priceStr}` },
    { topText: `ADA at ${priceStr}`, bottomText: "I'm fine" },
    { topText: `ADA at ${priceStr}`, bottomText: "my savings" },
    { topText: "opened my wallet", bottomText: "immediately closed it" },
    { topText: `${priceStr} again`, bottomText: "we never left" },
    { topText: "bought at the top", bottomText: `now it's ${priceStr}` },
    { topText: "the dip keeps dipping", bottomText: `ADA at ${priceStr}` },
    { topText: `${priceStr}`, bottomText: "I should have sold" },
  ];

  const neutralTemplates = [
    "fry", "both", "morpheus", "rollsafe", "drake",
    "cmm", "astronaut", "gru", "exit", "boat",
  ];
  const neutralTexts = [
    { topText: "Not sure if accumulating", bottomText: "or catching knives" },
    { topText: "buy the dip", bottomText: `or wait for ${priceStr}` },
    { topText: "What if I told you", bottomText: `${priceStr} is the new stable` },
    { topText: "Can't lose money", bottomText: "if you never sell" },
    { topText: "checking the charts", bottomText: "closing the app" },
    { topText: `${priceStr} is fair value`, bottomText: "change my mind" },
    { topText: `wait it's all ${priceStr}`, bottomText: "always has been" },
    { topText: `ADA pumps to ${priceStr}`, bottomText: "wait that's the same price" },
    { topText: "selling", bottomText: "holding and vibing" },
    { topText: `ADA at ${priceStr}`, bottomText: "I should buy a boat" },
  ];

  const bullishTemplates = [
    "stonks", "success", "oprah", "money", "buzz",
    "captain", "bender", "feelsgood", "firsttry", "ackbar",
  ];
  const bullishTexts = [
    { topText: `ADA at ${priceStr}`, bottomText: "stonks" },
    { topText: `ADA at ${priceStr}`, bottomText: "bought the dip" },
    { topText: "you get gains", bottomText: `ADA at ${priceStr}` },
    { topText: `ADA at ${priceStr}`, bottomText: "shut up and take my money" },
    { topText: `${priceStr}`, bottomText: "gains everywhere" },
    { topText: "look at me", bottomText: "I am the whale now" },
    { topText: `ADA at ${priceStr}`, bottomText: "with blackjack and lambos" },
    { topText: `ADA at ${priceStr}`, bottomText: "feels good man" },
    { topText: "timed the bottom perfectly", bottomText: "first try" },
    { topText: "it's a bull trap", bottomText: `ADA at ${priceStr}` },
  ];

  if (price < 0.251) {
    return { mood: "bearish" as const, template: pick(bearishTemplates), ...pick(bearishTexts) };
  } else if (price <= 0.253) {
    return { mood: "neutral" as const, template: pick(neutralTemplates), ...pick(neutralTexts) };
  } else {
    return { mood: "bullish" as const, template: pick(bullishTemplates), ...pick(bullishTexts) };
  }
}

const { mood, template, topText, bottomText } = getMood(price);
const memeUrl = `https://api.memegen.link/images/${template}/${memeEncode(topText)}/${memeEncode(bottomText)}.png`;

console.log(`Mood: ${mood} | Price: $${price.toFixed(8)}`);
console.log(`Meme: ${memeUrl}`);

// 5. Mint a CIP-68 NFT with the meme as the image.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const blueprint = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../plutus.json"), "utf8"),
);
const mintValidator = blueprint.validators.find(
  (v: { title: string }) => v.title === "meme_nft.meme_nft.mint",
);
if (!mintValidator) throw new Error("meme_nft validator not found in plutus.json");

const mintPolicyId = mintValidator.hash;
const mintScript = new PlutusV3({ bytes: Buffer.from(mintValidator.compiledCode, "hex") });

// Unique asset name suffix from timestamp
const suffix = Buffer.from(Date.now().toString(16).padStart(16, "0"), "hex");
const refPrefix = Buffer.from(Label.toLabel(100), "hex");   // 000643b0
const nftPrefix = Buffer.from(Label.toLabel(222), "hex");   // 000de140
const refAssetName = Buffer.concat([refPrefix, suffix]).toString("hex");
const nftAssetName = Buffer.concat([nftPrefix, suffix]).toString("hex");

// Helper: encode a UTF-8 string as PlutusData ByteArray.
function toBytes(str: string): Data.Data {
  return Data.bytearray(Buffer.from(str, "utf8").toString("hex"));
}

// CIP-68 metadata datum
const metadataMap = Data.map([
  [toBytes("name"), toBytes(`ADA Meme #${Date.now()}`)],
  [toBytes("image"), toBytes(memeUrl)],
  [toBytes("mood"), toBytes(mood)],
  [toBytes("price"), toBytes(price.toString())],
  [toBytes("feed"), toBytes("ADA/USD")],
]);

const cip68Datum = CIP68Codec.toData({
  metadata: metadataMap,
  version: 1n,
  extra: [],
});

// Attach minting policy and mint both tokens
const mintAssets = Assets.fromRecord({
  [`${mintPolicyId}${refAssetName}`]: 1n,
  [`${mintPolicyId}${nftAssetName}`]: 1n,
});

tx.attachScript({ script: mintScript })
  .mintAssets({
    assets: mintAssets,
    redeemer: Data.constr(0n, []),
  });

// Send reference token to a dedicated address with inline datum
const refTokenAssets = Assets.addLovelace(
  Assets.fromHexStrings(mintPolicyId, refAssetName, 1n),
  2_000_000n,
);
const nftAddress = Address.fromBech32("addr_test1qrxelc9qh6cqaetmj0egxlns6pplxucdewdwwjwl8gs353pk2t59f7xquj0z9azxup563z37xwfypqdawtqxh28hk6hs39e8sh");
tx.payToAddress({
  address: nftAddress,
  assets: refTokenAssets,
  datum: new InlineDatum.InlineDatum({ data: cip68Datum }),
});

console.log(`Minting CIP-68 NFT under policy: ${mintPolicyId}`);

// 6. Sign and execute the transaction:
const builtTx = await tx.build();
const digest = await builtTx.signAndSubmit();

console.log("Transaction Hash:", TransactionHash.toHex(digest));
console.log("Transaction submitted successfully.");
lazer.shutdown();
process.exit(0);

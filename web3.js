import CandleRenderer from "./candle";
import {
  Contract,
  formatUnits,
  parseUnits,
  id,
  JsonRpcProvider,
  WebSocketProvider,
  dataSlice,
  dataLength,
} from "ethers";
import { formatGwei } from "./utils";
import "./app.css";
import contractABI from "./contract.json";
import ercABI from "./erc20.json";

const TOKEN_ADDRESS = "0xC66c6BeB1e503341b7cC95f0865062B514aDAC8A";
const COMPOSER_ADDRESS = "0xeA33DbcB3C5E39507Aa0e5F85666DA1D354169Dc";

const canvas = document.getElementById("candlestickCanvas");
const rewardsView = document.getElementById("rewardsView");
const form = document.getElementById("main-form");

const scales = [
  {
    color: "success",
    bound: 0.005,
  },
  {
    color: "primary",
    bound: 0.015,
  },
  {
    color: "warning",
    bound: 0.03,
  },
];

const getActiveScaleIndex = (price, target) => {
  for (const [i, scale] of scales.entries()) {
    if (
      price <= target + target * scale.bound &&
      price >= target - target * scale.bound
    )
      return i;
  }

  return -1;
};

const renderer = new CandleRenderer(canvas);

function renderProgress(value, max) {
  const progressBar = document.getElementById("progress_bar");
  const progressValue = document.getElementById("progress_value");

  progressBar.max = max;
  progressBar.value = value;
  if (value < max) {
    let t = 3600 - value;
    let minutes = Math.floor(t / 60);
    let seconds = t - minutes * 60;
    progressValue.innerText = `${minutes}m ${seconds}s`;
    progressValue.classList.remove("blink");
  } else {
    progressValue.classList.add("blink");
    progressValue.innerText = "pending TX";
  }

  return;
}

function watchProgress(segmentStart) {
  const segmentProgress = Math.round(Date.now() / 1000) - segmentStart;

  renderProgress(segmentProgress, 3600);
}

async function update(provider) {
  async function findSegmentBlock(toBlock, retries = 0) {
    if (retries > 10) throw new Error("segment not found");
    const fromBlock = toBlock - 10000;
    const filter = {
      address: COMPOSER_ADDRESS,
      fromBlock,
      toBlock,
      topics: [
        id("Segment(uint256,uint256,uint256,uint256,uint256,uint256,uint256)"),
      ],
    };

    const logs = await provider.getLogs(filter);

    if (logs.length === 0) return findSegmentBlock(fromBlock, retries + 1);

    const lastLog = logs.slice(-1)[0];

    const parseEtherFloat = (n) =>
      parseFloat(formatUnits(dataSlice(lastLog.data, n * 32, n * 32 + 32), 6));

    const closePrice = parseEtherFloat(3); // it's the close of the
    const targetPrice = parseEtherFloat(6);

    return { fromBlock: lastLog.blockNumber, targetPrice, closePrice };
  }

  async function loadPrices(fromBlock, blockLimit, logs = []) {
    if (fromBlock > blockLimit)
      return logs.map((log) => parseFloat(formatUnits(log.data, 6)));

    const toBlock = fromBlock + 10000;

    const filter = {
      address: COMPOSER_ADDRESS,
      fromBlock,
      toBlock,
      topics: [id("NewPrice(uint256)")],
    };

    logs.push(...(await provider.getLogs(filter)));

    return loadPrices(toBlock, blockLimit, logs);
  }

  const blockNumber = await provider.getBlockNumber();
  let {
    fromBlock,
    targetPrice,
    closePrice: openPrice,
  } = await findSegmentBlock(blockNumber);

  const segmentStartedAt = (await provider.getBlock(fromBlock)).timestamp;
  const prices = await loadPrices(fromBlock, blockNumber);

  let highPrice = openPrice;
  let closePrice = openPrice;
  let lowPrice = openPrice;
  const updatePrice = (newPrice) => {
    closePrice = newPrice;

    if (closePrice > highPrice) highPrice = closePrice;
    if (closePrice < lowPrice) lowPrice = closePrice;
  };

  for (const p of prices) {
    updatePrice(p);
  }

  if (openPrice === 0) {
    openPrice = targetPrice;
  }

  scales[0].isActive = false;
  scales[1].isActive = false;
  scales[2].isActive = false;
  const activeScaleIndex = getActiveScaleIndex(closePrice, targetPrice);
  if (activeScaleIndex >= 0) scales[activeScaleIndex].isActive = true;

  renderer.render({
    open: openPrice,
    high: highPrice,
    low: lowPrice,
    close: closePrice,
    target: targetPrice,
    scales,
  });

  const interval = setInterval(() => watchProgress(segmentStartedAt), 500);

  return () => {
    clearInterval(interval);
  };
}

let cleanup;
let provider;
async function run() {
  if (cleanup) cleanup();
  cleanup = await update(provider);
}
async function main() {
  try {
    if (!provider || provider.websocket.readyState !== 1) {
      provider = new WebSocketProvider("wss://base-rpc.publicnode.com");
      /*
      provider = new WebSocketProvider(
        "wss://polygon-mainnet.infura.io/ws/v3/ba79be269a9a4f809c69e4f252b7ec0b"
      );*/
    }
    run();
  } catch (e) {
    console.error(e);
  }

  setTimeout(main, 15000);
}

main();

let currentView = "CHART";
const viewToggle = document.getElementById("action__view");
const status = document.querySelector("#status");
function renderStatus(text, variant = "primary") {
  status.classList.remove(...status.classList);
  status.classList.add(`is-${variant}`, "nes-text");
  status.innerHTML = text;
}

function renderView() {
  if (currentView === "CHART") {
    canvas.classList.remove("hidden");
    rewardsView.classList.add("hidden");
    run();
  } else {
    canvas.classList.add("hidden");
    rewardsView.classList.remove("hidden");
  }
}

viewToggle.addEventListener("click", () => {
  viewToggle.innerText = currentView;
  currentView = currentView === "CHART" ? "REWARDS" : "CHART";

  renderView();
});
function getContract(address = COMPOSER_ADDRESS, abi = contractABI) {
  return new Contract(address, abi, provider);
}
function loadContributions(address) {
  return getContract().contributions(address);
}
function loadSegmentVolume() {
  return getContract().segmentVolume();
}
function loadContributionsVolume() {
  return getContract().contributionsVolume();
}
function loadRewardPoolBalance() {
  return getContract(TOKEN_ADDRESS, ercABI).balanceOf(COMPOSER_ADDRESS);
}
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = new FormData(e.target);

  const address = data.get("address");

  try {
    if (dataLength(address) !== 20) throw new Error();
  } catch (e) {
    renderStatus("invalid address", "error");
    return;
  }

  renderStatus("loading...");

  try {
    const [
      { value: contributions, lockedValue: lockedAmount },
      volume,
      contributionsVolume,
      poolBalance,
    ] = await Promise.all([
      loadContributions(address),
      loadSegmentVolume(),
      loadContributionsVolume(),
      loadRewardPoolBalance(),
    ]);

    const supply = parseUnits("1000000", "gwei");

    const activeScaleIndex = scales.findIndex((s) => s.isActive);
    const multiplier =
      activeScaleIndex === 0
        ? 10n
        : activeScaleIndex === 1
        ? 3n
        : activeScaleIndex === 0
        ? 1n
        : 0n;

    const poolSize =
      (contributions * multiplier * volume * poolBalance) /
      (supply * 200n * contributionsVolume);

    

    renderStatus(
      `<div class="stack">
<div>
<span>Locked tokens:</span>
<span>${formatGwei(lockedAmount)}</span>
</div>
<div>
<span>Estimated rewards:</span>
<span>${formatGwei(poolSize)}</span>
</div>
</div>`
    );
  } catch (e) {
    console.error(e);
    debugger;
    renderStatus("network error, please try again later..", "error");
    return;
  }
});

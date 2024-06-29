import CandleRenderer from "./candle";
import {
  Contract,
  formatUnits,
  id,
  JsonRpcProvider,
  WebSocketProvider,
  dataSlice,
  dataLength,
} from "ethers";
import { formatGwei } from "./utils";
import "./app.css";
import contractABI from "./contract.json";

const COMPOSER_ADDRESS = "0xDa915F510Daf9Bf404915E651EeDcE46Dcb8Fe7e";

const canvas = document.getElementById("candlestickCanvas");
const rewardsView = document.getElementById("rewardsView");
const form = document.getElementById("main-form");

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
      parseFloat(
        formatUnits(dataSlice(lastLog.data, n * 32, n * 32 + 32), 6)
      );

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
  const prices = await loadPrices(fromBlock + 1, blockNumber);

  let highPrice = openPrice;
  let lowPrice = openPrice;
  let closePrice = openPrice;
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
    lowPrice = openPrice;
  }

  renderer.render({
    open: openPrice,
    high: highPrice,
    low: lowPrice,
    close: closePrice,
    target: targetPrice,
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
function getContract() {
  return new Contract(COMPOSER_ADDRESS, contractABI, provider);
}
function loadLockedFunds(address) {
  return getContract().lockedFunds(address);
}
function loadContributions(address) {
  return getContract().contributions(address);
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
    const [{ value: lockedAmount }, { value: contributions }] =
      await Promise.all([loadLockedFunds(address), loadContributions(address)]);

    renderStatus(
      `<div class="stack">
<div>
<span>Locked tokens:</span>
<span>${formatGwei(lockedAmount)}</span>
</div>
<div>
<span>Contributions:</span>
<span>${formatGwei(contributions)}</span>
</div>
</div>`
    );
  } catch (e) {
    renderStatus("network error, please try again later..", "error");
    return;
  }
});

import CandleRenderer from "./candle";
import {
  formatUnits,
  parseUnits,
  id,
  JsonRpcProvider,
  WebSocketProvider,
  dataSlice,
} from "ethers";
import "./app.css";

const COMPOSER_ADDRESS = "0x2FcCB85fE41cB50900B07e983157AA65a09F23Ee";

const renderer = new CandleRenderer(
  document.getElementById("candlestickCanvas")
);

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
  } else {
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
        formatUnits(dataSlice(lastLog.data, n * 32, n * 32 + 32), "ether")
      );

    const closePrice = parseEtherFloat(3); // it's the close of the
    const targetPrice = parseEtherFloat(6);

    return { fromBlock: lastLog.blockNumber, targetPrice, closePrice };
  }

  async function loadPrices(fromBlock, blockLimit, logs = []) {
    if (fromBlock > blockLimit)
      return logs.map((log) => parseFloat(formatUnits(log.data, "ether")));

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
  const {
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
async function main() {
  try {
    if (!provider || provider.websocket.readyState !== 1) {
      //provider = new WebSocketProvider("wss://base-rpc.publicnode.com");
      provider = new WebSocketProvider(
        "wss://polygon-mainnet.infura.io/ws/v3/ba79be269a9a4f809c69e4f252b7ec0b"
      );
    }
    if (cleanup) cleanup();
    cleanup = await update(provider);
  } catch (e) {
    console.error(e);
  }

  setTimeout(main, 15000);
}

main();

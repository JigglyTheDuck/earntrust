import { createWeb3Modal, defaultConfig } from "@web3modal/ethers";
import abi from "./erc20.json";
import wrappedABI from "./contract.json";
import "./app.css";
import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";

const tokenAddress = "0x0356Ee6D5c0a53f43D1AC2022B3d5bA7acf7e697";
const wrappedTokenAddress = "0x8aca2445f2af7ae603651883c4fe89322bfc95bb";

// 1. Get projectId from https://cloud.walletconnect.com
const projectId = "8f5f355009100190a740191196c25d18";

// 2. Set chains
const mainnet = {
  chainId: 8453,
  name: "BASE",
  currency: "ETH",
  explorerUrl: "https://basescan.org",
  rpcUrl: "https://base.llamarpc.com",
};

// 3. Create your application's metadata object
const metadata = {
  name: "My Website",
  description: "My Website description",
  url: "https://wrap.jiggly.app", // url must match your domain & subdomain
  icons: ["https://avatars.mywebsite.com/"],
};

// 4. Create Ethers config
const ethersConfig = defaultConfig({
  /*Required*/
  metadata,

  /*Optional*/
  enableEIP6963: true, // true by default
  enableInjected: true, // true by default
  enableCoinbase: true, // true by default
  rpcUrl: "...", // used for the Coinbase SDK
  defaultChainId: 1, // used for the Coinbase SDK
});

// 5. Create a Web3Modal instance
const modal = createWeb3Modal({
  ethersConfig,
  chains: [mainnet],
  projectId,
  enableAnalytics: true, // Optional - defaults to your Cloud configuration
  enableOnramp: true, // Optional - false as default
  themeMode: "light",
  themeVariables: {
    "--w3m-accent": "#108de0",
    "--w3m-border-radius-master": "0px",
    "--w3m-font-family": "Press Start 2P",
  },
});

const renderFloat = (numberAsString) => parseFloat(numberAsString).toFixed(4);

async function getSigner() {
  const walletProvider = modal.getWalletProvider();
  const ethersProvider = new BrowserProvider(walletProvider);
  const signer = await ethersProvider.getSigner();
  return signer;
}

async function approve(amount) {
  const ercContract = new Contract(tokenAddress, abi, await getSigner());

  return ercContract.approve(wrappedTokenAddress, amount);
}

async function timeout(t) {
  return new Promise((r) => setTimeout(r, t));
}

async function watchTx(txReceipt) {
  const walletProvider = modal.getWalletProvider();
  const ethersProvider = new BrowserProvider(walletProvider);

  return new Promise(async (r) => {
    const receipt = await ethersProvider.getTransactionReceipt(txReceipt?.hash);

    if (receipt?.blockNumber) r(receipt);
    else setTimeout(() => watchTx(txReceipt).then(r), 1000);
  });
}

async function getAllowance() {
  const signer = await getSigner();
  const ercContract = new Contract(tokenAddress, abi, signer);

  return ercContract.allowance(signer.address, wrappedTokenAddress);
}

async function canWrap(amount) {
  const allowance = await getAllowance();

  return amount <= allowance;
}

async function wrap(amount) {
  const contract = new Contract(
    wrappedTokenAddress,
    wrappedABI,
    await getSigner()
  );

  return contract.wrap(amount);
}

async function unwrap(amount) {
  const contract = new Contract(
    wrappedTokenAddress,
    wrappedABI,
    await getSigner()
  );

  return contract.unwrap(amount);
}

async function getBalance(isWrapped = false) {
  const signer = await getSigner();
  const ercContract = new Contract(
    isWrapped ? wrappedTokenAddress : tokenAddress,
    abi,
    signer
  );

  return ercContract.balanceOf(signer.address);
}

document.querySelector("#app").innerHTML = `
  <w3m-button></w3m-button>
`;

const radioInputs = document.querySelectorAll('input[name="wrap"]');

let destroyForm;

const handleRadioChange = (event) => {
  const selectedOption = event.target.value;

  if (destroyForm) destroyForm();

  if (selectedOption === "unwrap") {
    destroyForm = renderUnwrapForm();
  } else {
    destroyForm = renderWrapForm();
  }
};

radioInputs.forEach((radio) => {
  radio.addEventListener("change", handleRadioChange);
});

const form = document.querySelector("#main-form");
const input = document.querySelector("#amount");
const status = document.querySelector("#status");
const actionBtn = document.querySelector("#action");
const maxBtn = document.querySelector("#action-max");

function renderStatus(text, variant = "primary") {
  status.classList.remove(...status.classList);
  status.classList.add(`is-${variant}`, "nes-text");
  status.innerText = text;
}

function renderBtn(text, variant = "warning") {
  actionBtn.disabled = variant === "disabled";
  actionBtn.classList.remove(...actionBtn.classList);
  actionBtn.classList.add(`is-${variant}`, "nes-btn");
  actionBtn.innerText = text;
}

function renderWrapForm() {
  let allowance = 0;
  let balance = 0;
  const initialize = () =>
    Promise.all([getAllowance(), getBalance()]).then(
      ([_allowance, _balance]) => {
        balance = _balance;
        allowance = _allowance;
        renderStatus(`balance: ${renderFloat(formatUnits(balance, 18))}`);
      }
    );

  const onSubmit = async (e) => {
    e.preventDefault();
    const isApproved = actionBtn.innerText !== "APPROVE";
    renderBtn("LOADING", "disabled");
    try {
      if (isApproved) {
        await watchTx(await wrap(parseUnits(input.value, "ether")));
        renderStatus("transaction completed", "success");
        input.value = "0";
        await timeout(1000);
      } else {
        await watchTx(await approve(parseUnits(input.value, "ether")));

        renderStatus("approval completed", "success");

        await timeout(1000);
      }
    } catch (e) {
    } finally {
      initialize().then(() => render(input.value));
    }
  };

  const render = (inputValue) => {
    const wei = parseUnits(inputValue, "ether");
    if (wei > balance) {
      renderBtn("INSUFFICIENT BALANCE", "disabled");
    } else if (wei <= allowance) {
      renderBtn("SEND TRANSACTION");
    } else {
      renderBtn("APPROVE");
    }
  };

  const onInput = (e) => {
    render(e.target.value);
  };

  form.addEventListener("submit", onSubmit);
  input.addEventListener("input", onInput);
  input.value = "";
  initialize();

  return () => {
    form.removeEventListener("submit", onSubmit);
    input.removeEventListener("input", onInput);
  };
}

function renderUnwrapForm() {
  let balance;
  const initialize = () =>
    getBalance(true).then((result) => {
      balance = result;
      renderStatus(`balance: ${renderFloat(formatUnits(balance, 18))}`);
    });

  const onSubmit = async (e) => {
    e.preventDefault();
    renderBtn("LOADING", "disabled");
    try {
      await watchTx(await unwrap(parseUnits(input.value, "ether")));
      renderStatus("tokens unwrapped", "success");
      input.value = "";
      await timeout(1000);
    } catch (e) {
    } finally {
      initialize().then(() => render("0"));
    }
  };

  const render = (inputValue) => {
    const wei = parseUnits(inputValue, "ether");
    if (wei > balance) {
      renderBtn("INSUFFICIENT BALANCE", "disabled");
    } else {
      renderBtn("SEND TRANSACTION", "warning");
    }
  };

  const onInput = (e) => {
    render(e.target.value);
  };

  form.addEventListener("submit", onSubmit);
  input.addEventListener("input", onInput);
  input.value = "";
  initialize();

  return () => {
    form.removeEventListener("submit", onSubmit);
    input.removeEventListener("input", onInput);
  };
}

function handler({ name, icon }) {
  actionBtn.classList.remove("is-disabled");
  actionBtn.classList.add("is-warning");
  actionBtn.disabled = false;
  input.disabled = false;
  destroyForm = renderWrapForm();
}

radioInputs[0].checked = true;
radioInputs[1].checked = false;
modal.subscribeWalletInfo(handler);

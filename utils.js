import { formatUnits } from "ethers";

export function formatGwei(value) {
  return parseFloat(formatUnits(value, "gwei")).toFixed(3);
}

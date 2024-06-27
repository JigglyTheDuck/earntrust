export default class CandleRenderer {
  canvas;
  candleWidth = 32;
  priceData;
  DIGITS = 4;

  withLabel(label, value) {
    if (window.innerWidth < 640) return value.toFixed(this.DIGITS);
    return `${label}: ${value.toFixed(this.DIGITS)}`;
  }

  constructor(element) {
    this.canvas = element;

    this.attachListeners();

    this.resize();
  }

  get ctx() {
    return this.canvas.getContext("2d");
  }

  attachListeners() {
    window.addEventListener("resize", this.resize.bind(this));
  }

  resize() {
    this.canvas.width = 0;
    this.canvas.height = 0;
    const { width, height } = this.canvas.getBoundingClientRect();

    this.canvas.width = width;
    this.canvas.height = height;

    if (this.priceData) this.render(this.priceData);
  }

  render(priceData) {
    this.priceData = priceData;
    const { open, close, low, high, target } = priceData;
    const candleX = this.canvas.width / 2 - this.candleWidth / 2;
    const color = getComputedStyle(document.documentElement).getPropertyValue(
      open > close ? "--color-error" : "--color-success"
    );

    const lowPrice = Math.min(target, low);
    const highPrice = Math.max(target, high);

    const scalePrice = (price) => {
      const diff = (highPrice - lowPrice) / (window.innerHeight > 600 ? 16 : 8);
      let min = lowPrice - diff;
      const range = highPrice + diff - min;
      return ((price - min) / range) * this.canvas.height;
    };

    const ctx = this.ctx;
    const drawHorizontalLine = (from, to, y) => {
      ctx.beginPath();
      ctx.moveTo(from, y);
      ctx.lineTo(to, y);
      ctx.stroke();
    };

    const drawScale = (distance, color) => {
      ctx.strokeStyle = getComputedStyle(
        document.documentElement
      ).getPropertyValue(`--color-${color}`);

      drawHorizontalLine(
        this.canvas.width - 12,
        this.canvas.width,
        this.canvas.height - scalePrice(target + target * distance)
      );

      drawHorizontalLine(
        this.canvas.width - 12,
        this.canvas.width,
        this.canvas.height - scalePrice(target - target * distance)
      );

      ctx.strokeStyle = getComputedStyle(
        document.documentElement
      ).getPropertyValue("--color-text-primary");
    };
    ctx.lineWidth = 4;
    ctx.imageSmoothingEnabled = false;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const scaledOpen = scalePrice(open);
    const scaledHigh = scalePrice(high);
    const scaledLow = scalePrice(low);
    const scaledClose = scalePrice(close);
    const scaledTarget = scalePrice(target);

    // Draw high price label above the candle
    ctx.strokeStyle = getComputedStyle(
      document.documentElement
    ).getPropertyValue("--color-text-primary");
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-text-primary"
    );
    ctx.textAlign = "center";
    ctx.font = `${window.innerWidth > 800 ? 16 : 14}px 'Press Start 2P'`;
    ctx.fillText(
      this.withLabel("High", high),
      candleX + this.candleWidth / 2,
      this.canvas.height - scaledHigh - 5
    );

    // Draw low price label below the candle
    ctx.fillText(
      this.withLabel("Low", low),
      candleX + this.candleWidth / 2,
      this.canvas.height - scaledLow + 22
    );

    // Draw current price on the right side of the candle
    ctx.textAlign = "right";
    if (close !== high && close !== low)
      ctx.fillText(
        close.toFixed(this.DIGITS),
        this.canvas.width - 16,
        this.canvas.height - scaledClose - 5
      );

    drawHorizontalLine(
      this.canvas.width / 2 - 2,
      this.canvas.width,
      this.canvas.height - scaledClose + (close < open ? 2 : -2)
    );

    ctx.strokeStyle = getComputedStyle(
      document.documentElement
    ).getPropertyValue("--color-primary");
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-primary"
    );

    // Draw price target on the left side of the canvas
    ctx.textAlign = "left";
    ctx.fillText(
      this.withLabel("T", target),
      0,
      this.canvas.height - scaledTarget - 5
    );
    drawHorizontalLine(
      0,
      this.canvas.width / 2 + 2,
      this.canvas.height - scaledTarget
    );

    drawScale(0.005, "success");
    drawScale(0.02, "primary");
    drawScale(0.05, "error");

    ctx.beginPath();
    ctx.moveTo(candleX + this.candleWidth / 2, this.canvas.height - scaledHigh);
    ctx.lineTo(candleX + this.candleWidth / 2, this.canvas.height - scaledLow);
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fillRect(
      candleX,
      this.canvas.height - Math.max(scaledOpen, scaledClose),
      this.candleWidth,
      Math.abs(scaledOpen - scaledClose)
    );
  }
}

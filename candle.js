function hexToRgba(hex, alpha = 0.2) {
  // Remove the hash at the start if it's there
  hex = hex.replace(/^#/, "");

  // Parse the r, g, b values
  let bigint = parseInt(hex, 16);
  let r = (bigint >> 16) & 255;
  let g = (bigint >> 8) & 255;
  let b = bigint & 255;

  // Return the RGBA string
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default class CandleRenderer {
  canvas;
  candleWidth = 32;
  priceData;
  DIGITS = 3;

  withLabel(label, value) {
    if (window.innerWidth < 640) return `$${value.toFixed(this.DIGITS)}`;
    return `${label}: $${value.toFixed(this.DIGITS)}`;
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
    const { scales, open, close, low, high, target } = priceData;
    const candleX = this.canvas.width / 2 - this.candleWidth / 2;
    const color = getComputedStyle(document.documentElement).getPropertyValue(
      open > close ? "--color-error" : "--color-success"
    );

    const lowPrice = Math.min(target - target * 0.02, low);
    const highPrice = Math.max(target + target * 0.02, high);

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

    const drawRect = (y0, y1) => {
      const height = y1 - y0;
      ctx.beginPath();
      const startY = this.canvas.height - scalePrice(target);
      ctx.moveTo(0, startY);
      ctx.lineTo(this.canvas.width / 2, y1);
      ctx.lineTo(this.canvas.width / 2, y0);

      ctx.rect(this.canvas.width / 2, y0, this.canvas.width / 2, height); // Add a rectangle to the current path
      ctx.fill(); // Render the path
    };

    const drawScale = (distance, color, limit, isActive = false) => {
      ctx.fillStyle = hexToRgba(
        getComputedStyle(document.documentElement).getPropertyValue(
          `--color-${color}`
        ),
        isActive ? 0.66 : 0.2
      );
      let y = this.canvas.height - scalePrice(target + target * distance);
      // TODO: highlight the section if within
      if (!limit) {
        const y1 = this.canvas.height - scalePrice(target - target * distance);
        drawRect(y, y1);
      } else {
        const y1 = this.canvas.height - scalePrice(target + target * limit);
        drawRect(y, y1);

        y = this.canvas.height - scalePrice(target - target * distance);
        const y2 = this.canvas.height - scalePrice(target - target * limit);
        drawRect(y, y2);
      }

      ctx.fillStyle = getComputedStyle(
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

    const drawScales = () => {
      let previousBound = 0;
      for (const [i, scale] of scales.entries()) {
        drawScale(scale.bound, scale.color, previousBound, scale.isActive);
        previousBound = scale.bound;
      }
    };

    drawScales();

    // Draw high price label above the candle
    ctx.strokeStyle = getComputedStyle(
      document.documentElement
    ).getPropertyValue("--color-text-primary");
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-text-primary"
    );
    ctx.textAlign = "center";
    ctx.font = `${window.innerWidth > 800 ? 16 : 14}px 'Press Start 2P'`;
    // we just need to make sure we're not rendering overlaying text
    if (high !== low) {
      if (high !== close)
        ctx.fillText(
          this.withLabel("High", high),
          candleX + this.candleWidth / 2,
          this.canvas.height - scaledHigh - 5
        );
      if (low !== close)
        ctx.fillText(
          this.withLabel("Low", low),
          candleX + this.candleWidth / 2,
          this.canvas.height - scaledLow + 22
        );
    }

    // Draw current price on the right side of the candle
    ctx.textAlign = "right";
    ctx.fillText(
      `$${close.toFixed(this.DIGITS)}`,
      this.canvas.width - 8,
      this.canvas.height - scaledClose - 5
    );

    drawHorizontalLine(
      this.canvas.width / 2 - 2,
      this.canvas.width - 8,
      this.canvas.height - scaledClose + (close < open ? 2 : -2)
    );

    ctx.strokeStyle = getComputedStyle(
      document.documentElement
    ).getPropertyValue("--color-error");
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-error"
    );

    // Draw price target on the left side of the canvas
    ctx.textAlign = "left";
    ctx.fillText(
      this.withLabel("T", target),
      4,
      this.canvas.height - scaledTarget - 5
    );
    drawHorizontalLine(
      8,
      this.canvas.width / 2 + 2,
      this.canvas.height - scaledTarget
    );

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

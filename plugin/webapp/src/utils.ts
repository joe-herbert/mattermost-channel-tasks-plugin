export const adjustOpacity = (foreground: string, background: string, opacity: number) => {
    const hex2rgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : {r: 255, g: 255, b: 255};
    };

    const fg = hex2rgb(foreground);
    const bg = hex2rgb(background);

    const r = Math.round(fg.r * opacity + bg.r * (1 - opacity));
    const g = Math.round(fg.g * opacity + bg.g * (1 - opacity));
    const b = Math.round(fg.b * opacity + bg.b * (1 - opacity));

    return `rgb(${r}, ${g}, ${b})`;
};

export const isHexLight = (hex: string) => {
    // Source - https://stackoverflow.com/a/12043228
    let color = hex.substring(1);      // strip #
    let rgb = parseInt(color, 16);   // convert rrggbb to decimal
    let r = (rgb >> 16) & 0xff;  // extract red
    let g = (rgb >>  8) & 0xff;  // extract green
    let b = (rgb >>  0) & 0xff;  // extract blue

    let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b; // per ITU-R BT.709

    return luma > 100;
}
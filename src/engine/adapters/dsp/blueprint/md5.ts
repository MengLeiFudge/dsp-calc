function add32(left: number, right: number): number {
    return (left + right) | 0;
}

function rotateLeft(value: number, shift: number): number {
    return (value << shift) | (value >>> (32 - shift));
}

function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return add32(rotateLeft(add32(add32(a, q), add32(x, t)), s), b);
}

function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn((b & c) | ((~b) & d), a, b, x, s, t);
}

function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn((b & d) | (c & (~d)), a, b, x, s, t);
}

function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn(b ^ c ^ d, a, b, x, s, t);
}

function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn(c ^ (b | (~d)), a, b, x, s, t);
}

function toWordArray(bytes: Uint8Array): number[] {
    const bitLength = bytes.length * 8;
    const words = new Array<number>((((bytes.length + 8) >>> 6) + 1) * 16).fill(0);
    for (let i = 0; i < bytes.length; i++) {
        words[i >> 2] |= bytes[i] << ((i % 4) * 8);
    }
    words[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
    words[words.length - 2] = bitLength & 0xffffffff;
    words[words.length - 1] = Math.floor(bitLength / 0x100000000);
    return words;
}

function wordToHex(value: number): string {
    let output = '';
    for (let i = 0; i < 4; i++) {
        output += ((value >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    }
    return output;
}

export function md5Utf8(input: string): string {
    const words = toWordArray(new TextEncoder().encode(input));
    let a = 0x67452301;
    let b = 0xefcdab89;
    let c = 0x98badcfe;
    let d = 0x10325476;

    for (let i = 0; i < words.length; i += 16) {
        const olda = a;
        const oldb = b;
        const oldc = c;
        const oldd = d;

        a = ff(a, b, c, d, words[i], 7, -680876936);
        d = ff(d, a, b, c, words[i + 1], 12, -389564586);
        c = ff(c, d, a, b, words[i + 2], 17, 606105819);
        b = ff(b, c, d, a, words[i + 3], 22, -1044525330);
        a = ff(a, b, c, d, words[i + 4], 7, -176418897);
        d = ff(d, a, b, c, words[i + 5], 12, 1200080426);
        c = ff(c, d, a, b, words[i + 6], 17, -1473231341);
        b = ff(b, c, d, a, words[i + 7], 22, -45705983);
        a = ff(a, b, c, d, words[i + 8], 7, 1770035416);
        d = ff(d, a, b, c, words[i + 9], 12, -1958414417);
        c = ff(c, d, a, b, words[i + 10], 17, -42063);
        b = ff(b, c, d, a, words[i + 11], 22, -1990404162);
        a = ff(a, b, c, d, words[i + 12], 7, 1804603682);
        d = ff(d, a, b, c, words[i + 13], 12, -40341101);
        c = ff(c, d, a, b, words[i + 14], 17, -1502002290);
        b = ff(b, c, d, a, words[i + 15], 22, 1236535329);

        a = gg(a, b, c, d, words[i + 1], 5, -165796510);
        d = gg(d, a, b, c, words[i + 6], 9, -1069501632);
        c = gg(c, d, a, b, words[i + 11], 14, 643717713);
        b = gg(b, c, d, a, words[i], 20, -373897302);
        a = gg(a, b, c, d, words[i + 5], 5, -701558691);
        d = gg(d, a, b, c, words[i + 10], 9, 38016083);
        c = gg(c, d, a, b, words[i + 15], 14, -660478335);
        b = gg(b, c, d, a, words[i + 4], 20, -405537848);
        a = gg(a, b, c, d, words[i + 9], 5, 568446438);
        d = gg(d, a, b, c, words[i + 14], 9, -1019803690);
        c = gg(c, d, a, b, words[i + 3], 14, -187363961);
        b = gg(b, c, d, a, words[i + 8], 20, 1163531501);
        a = gg(a, b, c, d, words[i + 13], 5, -1444681467);
        d = gg(d, a, b, c, words[i + 2], 9, -51403784);
        c = gg(c, d, a, b, words[i + 7], 14, 1735328473);
        b = gg(b, c, d, a, words[i + 12], 20, -1926607734);

        a = hh(a, b, c, d, words[i + 5], 4, -378558);
        d = hh(d, a, b, c, words[i + 8], 11, -2022574463);
        c = hh(c, d, a, b, words[i + 11], 16, 1839030562);
        b = hh(b, c, d, a, words[i + 14], 23, -35309556);
        a = hh(a, b, c, d, words[i + 1], 4, -1530992060);
        d = hh(d, a, b, c, words[i + 4], 11, 1272893353);
        c = hh(c, d, a, b, words[i + 7], 16, -155497632);
        b = hh(b, c, d, a, words[i + 10], 23, -1094730640);
        a = hh(a, b, c, d, words[i + 13], 4, 681279174);
        d = hh(d, a, b, c, words[i], 11, -358537222);
        c = hh(c, d, a, b, words[i + 3], 16, -722521979);
        b = hh(b, c, d, a, words[i + 6], 23, 76029189);
        a = hh(a, b, c, d, words[i + 9], 4, -640364487);
        d = hh(d, a, b, c, words[i + 12], 11, -421815835);
        c = hh(c, d, a, b, words[i + 15], 16, 530742520);
        b = hh(b, c, d, a, words[i + 2], 23, -995338651);

        a = ii(a, b, c, d, words[i], 6, -198630844);
        d = ii(d, a, b, c, words[i + 7], 10, 1126891415);
        c = ii(c, d, a, b, words[i + 14], 15, -1416354905);
        b = ii(b, c, d, a, words[i + 5], 21, -57434055);
        a = ii(a, b, c, d, words[i + 12], 6, 1700485571);
        d = ii(d, a, b, c, words[i + 3], 10, -1894986606);
        c = ii(c, d, a, b, words[i + 10], 15, -1051523);
        b = ii(b, c, d, a, words[i + 1], 21, -2054922799);
        a = ii(a, b, c, d, words[i + 8], 6, 1873313359);
        d = ii(d, a, b, c, words[i + 15], 10, -30611744);
        c = ii(c, d, a, b, words[i + 6], 15, -1560198380);
        b = ii(b, c, d, a, words[i + 13], 21, 1309151649);
        a = ii(a, b, c, d, words[i + 4], 6, -145523070);
        d = ii(d, a, b, c, words[i + 11], 10, -1120210379);
        c = ii(c, d, a, b, words[i + 2], 15, 718787259);
        b = ii(b, c, d, a, words[i + 9], 21, -343485551);

        a = add32(a, olda);
        b = add32(b, oldb);
        c = add32(c, oldc);
        d = add32(d, oldd);
    }

    return `${wordToHex(a)}${wordToHex(b)}${wordToHex(c)}${wordToHex(d)}`;
}

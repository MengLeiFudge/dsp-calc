import assert from 'node:assert/strict';
import {createSingleArea, decodeBlueprintStringForCheck, encodeBlueprintString} from './blueprintData';
import {md5Utf8} from './md5';

function test(name: string, fn: () => void): void {
    try {
        fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
}

class BinaryReader {
    private readonly view: DataView;
    offset = 0;

    constructor(bytes: Uint8Array) {
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }

    int32(): number {
        const value = this.view.getInt32(this.offset, true);
        this.offset += 4;
        return value;
    }

    int16(): number {
        const value = this.view.getInt16(this.offset, true);
        this.offset += 2;
        return value;
    }

    sbyte(): number {
        const value = this.view.getInt8(this.offset);
        this.offset += 1;
        return value;
    }

    byte(): number {
        const value = this.view.getUint8(this.offset);
        this.offset += 1;
        return value;
    }

    float32(): number {
        const value = this.view.getFloat32(this.offset, true);
        this.offset += 4;
        return value;
    }
}

test('MD5 使用 UTF-8 字节计算标准摘要', () => {
    assert.equal(md5Utf8('abc'), '900150983cd24fb0d6963f7d28e17f72');
});

test('DSP 蓝图字符串 checksum 与 payload 结构自洽', () => {
    const blueprint = encodeBlueprintString({
        timeTicks: 638000000000000000n,
        shortDesc: 'Test',
        desc: '',
        dragBoxSizeX: 4,
        dragBoxSizeY: 4,
        areas: [createSingleArea(4, 4)],
        buildings: [{
            index: 0,
            itemId: 2303,
            modelIndex: 66,
            localOffsetX: 0,
            localOffsetY: 0,
            recipeId: 1,
            parameters: [1],
        }],
    });

    const decoded = decodeBlueprintStringForCheck(blueprint);
    assert.equal(decoded.checksum, decoded.expectedChecksum);
    assert.match(decoded.header, /^BLUEPRINT:1,10,41508,0,0,0,0,0,638000000000000000,/);

    const reader = new BinaryReader(decoded.payload);
    assert.equal(reader.int32(), 2);
    assert.equal(reader.int32(), 0);
    assert.equal(reader.int32(), 0);
    assert.equal(reader.int32(), 0);
    assert.equal(reader.int32(), 4);
    assert.equal(reader.int32(), 4);
    assert.equal(reader.int32(), 0);
    assert.equal(reader.byte(), 1);
    assert.equal(reader.sbyte(), 0);
    assert.equal(reader.sbyte(), -1);
    assert.equal(reader.int16(), 0);
    assert.equal(reader.int16(), 200);
    assert.equal(reader.int16(), 0);
    assert.equal(reader.int16(), 0);
    assert.equal(reader.int16(), 4);
    assert.equal(reader.int16(), 4);
    assert.equal(reader.int32(), 1);
    assert.equal(reader.int32(), -102);
    assert.equal(reader.int32(), 0);
    assert.equal(reader.int16(), 2303);
    assert.equal(reader.int16(), 66);
    assert.equal(reader.sbyte(), 0);
    assert.equal(reader.float32(), 0);
    assert.equal(reader.float32(), 0);
    assert.equal(reader.float32(), 0);
    assert.equal(reader.float32(), 0);
});

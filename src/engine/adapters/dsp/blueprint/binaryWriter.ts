export class BlueprintBinaryWriter {
    private buffer = new ArrayBuffer(1024);
    private view = new DataView(this.buffer);
    private offset = 0;

    private ensureCapacity(additionalBytes: number): void {
        const required = this.offset + additionalBytes;
        if (required <= this.buffer.byteLength) {
            return;
        }
        let nextLength = this.buffer.byteLength;
        while (nextLength < required) {
            nextLength *= 2;
        }
        const next = new ArrayBuffer(nextLength);
        new Uint8Array(next).set(new Uint8Array(this.buffer, 0, this.offset));
        this.buffer = next;
        this.view = new DataView(this.buffer);
    }

    writeByte(value: number): void {
        this.ensureCapacity(1);
        this.view.setUint8(this.offset, value & 0xff);
        this.offset += 1;
    }

    writeSByte(value: number): void {
        this.ensureCapacity(1);
        this.view.setInt8(this.offset, value);
        this.offset += 1;
    }

    writeInt16(value: number): void {
        this.ensureCapacity(2);
        this.view.setInt16(this.offset, value, true);
        this.offset += 2;
    }

    writeInt32(value: number): void {
        this.ensureCapacity(4);
        this.view.setInt32(this.offset, value, true);
        this.offset += 4;
    }

    writeFloat32(value: number): void {
        this.ensureCapacity(4);
        this.view.setFloat32(this.offset, value, true);
        this.offset += 4;
    }

    write7BitEncodedInt(value: number): void {
        let remaining = value >>> 0;
        while (remaining >= 0x80) {
            this.writeByte((remaining | 0x80) & 0xff);
            remaining >>>= 7;
        }
        this.writeByte(remaining);
    }

    writeString(value: string): void {
        const bytes = new TextEncoder().encode(value);
        this.write7BitEncodedInt(bytes.length);
        this.writeBytes(bytes);
    }

    writeBytes(bytes: Uint8Array): void {
        this.ensureCapacity(bytes.length);
        new Uint8Array(this.buffer, this.offset, bytes.length).set(bytes);
        this.offset += bytes.length;
    }

    toUint8Array(): Uint8Array {
        return new Uint8Array(this.buffer.slice(0, this.offset));
    }
}

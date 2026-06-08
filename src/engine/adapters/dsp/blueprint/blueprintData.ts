import {gzipSync, gunzipSync} from 'fflate';
import {BlueprintBinaryWriter} from './binaryWriter';
import {md5Utf8} from './md5';

const DOTNET_TICKS_AT_UNIX_EPOCH = 621355968000000000n;
const TICKS_PER_MILLISECOND = 10000n;
const DEFAULT_GAME_VERSION = '0.10.32.0';
const ONE_ICON_LAYOUT = 10;
const DSP_WHITE_ICON = 41508;

export interface BlueprintAreaData {
    index: number;
    parentIndex: number;
    tropicAnchor: number;
    areaSegments: number;
    anchorLocalOffsetX: number;
    anchorLocalOffsetY: number;
    width: number;
    height: number;
}

export interface BlueprintBuildingData {
    index: number;
    itemId: number;
    modelIndex: number;
    areaIndex?: number;
    localOffsetX: number;
    localOffsetY: number;
    localOffsetZ?: number;
    yaw?: number;
    tilt?: number;
    pitch?: number;
    localOffsetX2?: number;
    localOffsetY2?: number;
    localOffsetZ2?: number;
    yaw2?: number;
    tilt2?: number;
    pitch2?: number;
    outputObjIndex?: number;
    inputObjIndex?: number;
    outputToSlot?: number;
    inputFromSlot?: number;
    outputFromSlot?: number;
    inputToSlot?: number;
    outputOffset?: number;
    inputOffset?: number;
    recipeId?: number;
    filterId?: number;
    parameters?: number[];
    content?: string;
}

export interface BlueprintDataModel {
    layout?: number;
    icon0?: number;
    icon1?: number;
    icon2?: number;
    icon3?: number;
    icon4?: number;
    timeTicks?: bigint;
    gameVersion?: string;
    shortDesc?: string;
    author?: string;
    customVersion?: string;
    externalFields?: string;
    desc?: string;
    cursorOffsetX?: number;
    cursorOffsetY?: number;
    cursorTargetArea?: number;
    dragBoxSizeX: number;
    dragBoxSizeY: number;
    primaryAreaIdx?: number;
    areas: BlueprintAreaData[];
    buildings: BlueprintBuildingData[];
}

export interface DecodedBlueprintString {
    header: string;
    payload: Uint8Array;
    checksum: string;
    expectedChecksum: string;
}

function isBeltItem(itemId: number): boolean {
    return itemId >= 2001 && itemId <= 2009;
}

function isSorterItem(itemId: number): boolean {
    return itemId >= 2011 && itemId <= 2019;
}

function nowDotnetTicks(): bigint {
    return BigInt(Date.now()) * TICKS_PER_MILLISECOND + DOTNET_TICKS_AT_UNIX_EPOCH;
}

function bytesToBase64(bytes: Uint8Array): string {
    const maybeBuffer = globalThis as typeof globalThis & {
        Buffer?: {from(bytes: Uint8Array): {toString(encoding: 'base64'): string}};
    };
    if (maybeBuffer.Buffer) {
        return maybeBuffer.Buffer.from(bytes).toString('base64');
    }

    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
    const maybeBuffer = globalThis as typeof globalThis & {
        Buffer?: {from(input: string, encoding: 'base64'): Uint8Array};
    };
    if (maybeBuffer.Buffer) {
        return new Uint8Array(maybeBuffer.Buffer.from(base64, 'base64'));
    }

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function writeArea(writer: BlueprintBinaryWriter, area: BlueprintAreaData): void {
    writer.writeSByte(area.index);
    writer.writeSByte(area.parentIndex);
    writer.writeInt16(area.tropicAnchor);
    writer.writeInt16(area.areaSegments);
    writer.writeInt16(area.anchorLocalOffsetX);
    writer.writeInt16(area.anchorLocalOffsetY);
    writer.writeInt16(area.width);
    writer.writeInt16(area.height);
}

function writeBuilding(writer: BlueprintBinaryWriter, building: BlueprintBuildingData): void {
    writer.writeInt32(-102);
    writer.writeInt32(building.index);
    writer.writeInt16(building.itemId);
    writer.writeInt16(building.modelIndex);
    writer.writeSByte(building.areaIndex ?? 0);
    writer.writeFloat32(building.localOffsetX);
    writer.writeFloat32(building.localOffsetY);
    writer.writeFloat32(building.localOffsetZ ?? 0);
    writer.writeFloat32(building.yaw ?? 0);

    if (isBeltItem(building.itemId)) {
        writer.writeFloat32(building.tilt ?? 0);
    } else if (isSorterItem(building.itemId)) {
        writer.writeFloat32(building.tilt ?? 0);
        writer.writeFloat32(building.pitch ?? 0);
        writer.writeFloat32(building.localOffsetX2 ?? building.localOffsetX);
        writer.writeFloat32(building.localOffsetY2 ?? building.localOffsetY);
        writer.writeFloat32(building.localOffsetZ2 ?? building.localOffsetZ ?? 0);
        writer.writeFloat32(building.yaw2 ?? building.yaw ?? 0);
        writer.writeFloat32(building.tilt2 ?? building.tilt ?? 0);
        writer.writeFloat32(building.pitch2 ?? building.pitch ?? 0);
    }

    writer.writeInt32(building.outputObjIndex ?? -1);
    writer.writeInt32(building.inputObjIndex ?? -1);
    writer.writeSByte(building.outputToSlot ?? 0);
    writer.writeSByte(building.inputFromSlot ?? 0);
    writer.writeSByte(building.outputFromSlot ?? 0);
    writer.writeSByte(building.inputToSlot ?? 0);
    writer.writeSByte(building.outputOffset ?? 0);
    writer.writeSByte(building.inputOffset ?? 0);
    writer.writeInt16(building.recipeId ?? 0);
    writer.writeInt16(building.filterId ?? 0);

    const parameters = building.parameters ?? [];
    writer.writeInt16(parameters.length);
    for (const parameter of parameters) {
        writer.writeInt32(parameter);
    }

    const content = building.content ?? '';
    writer.writeInt32(content.length);
    if (content.length > 0) {
        writer.writeString(content);
    }
}

export function createSingleArea(width: number, height: number): BlueprintAreaData {
    return {
        index: 0,
        parentIndex: -1,
        tropicAnchor: 0,
        areaSegments: 200,
        anchorLocalOffsetX: 0,
        anchorLocalOffsetY: 0,
        width,
        height,
    };
}

export function exportBlueprintPayload(model: BlueprintDataModel): Uint8Array {
    const writer = new BlueprintBinaryWriter();
    writer.writeInt32(2);
    writer.writeInt32(model.cursorOffsetX ?? 0);
    writer.writeInt32(model.cursorOffsetY ?? 0);
    writer.writeInt32(model.cursorTargetArea ?? 0);
    writer.writeInt32(model.dragBoxSizeX);
    writer.writeInt32(model.dragBoxSizeY);
    writer.writeInt32(model.primaryAreaIdx ?? 0);

    writer.writeByte(model.areas.length);
    for (const area of model.areas) {
        writeArea(writer, area);
    }

    writer.writeInt32(model.buildings.length);
    for (const building of model.buildings) {
        writeBuilding(writer, building);
    }

    writer.writeInt32(1);
    writer.writeByte(0);
    return writer.toUint8Array();
}

export function encodeBlueprintString(model: BlueprintDataModel): string {
    const header = [
        'BLUEPRINT:1',
        model.layout ?? ONE_ICON_LAYOUT,
        model.icon0 ?? DSP_WHITE_ICON,
        model.icon1 ?? 0,
        model.icon2 ?? 0,
        model.icon3 ?? 0,
        model.icon4 ?? 0,
        0,
        (model.timeTicks ?? nowDotnetTicks()).toString(),
        model.gameVersion ?? DEFAULT_GAME_VERSION,
        model.shortDesc ?? 'DSPCalc',
        model.author ?? '',
        model.customVersion ?? '',
        model.externalFields ?? '',
        model.desc ?? '',
    ].join(',') + '"';
    const zippedPayload = gzipSync(exportBlueprintPayload(model));
    const encodedPayload = bytesToBase64(zippedPayload);
    return `${header}${encodedPayload}"${md5Utf8(header + encodedPayload)}`;
}

export function decodeBlueprintStringForCheck(value: string): DecodedBlueprintString {
    const checksum = value.slice(-32);
    const body = value.slice(0, -33);
    const separatorIndex = body.indexOf('"');
    if (separatorIndex < 0) {
        throw new Error('蓝图字符串缺少 header 分隔符');
    }
    const header = body.slice(0, separatorIndex + 1);
    const encodedPayload = body.slice(separatorIndex + 1);
    return {
        header,
        payload: gunzipSync(base64ToBytes(encodedPayload)),
        checksum,
        expectedChecksum: md5Utf8(header + encodedPayload),
    };
}

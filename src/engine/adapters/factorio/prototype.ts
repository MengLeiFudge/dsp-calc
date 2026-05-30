export type FactorioPrototypeMap<T> = Record<string, T>;

export interface FactorioPrototypeBase {
    type?: string;
    name: string;
    localised_name?: unknown;
}

export interface FactorioEntityPrototype extends FactorioPrototypeBase {
    collision_box?: FactorioBoundingBox;
}

export type FactorioBoundingBox = FactorioBoundingBoxPair | FactorioBoundingBoxStruct;
export type FactorioBoundingBoxPair = [FactorioMapPosition, FactorioMapPosition];

export interface FactorioBoundingBoxStruct {
    left_top: FactorioMapPosition;
    right_bottom: FactorioMapPosition;
}

export type FactorioMapPosition = [number, number] | {x: number; y: number};

function getPosition(position: FactorioMapPosition): {x: number; y: number} {
    if (Array.isArray(position)) {
        return {x: position[0], y: position[1]};
    }
    return position;
}

export function getFactorioBoundingBoxArea(collisionBox: FactorioBoundingBox | undefined): number {
    if (!collisionBox) {
        return 1;
    }
    const leftTop = getPosition(Array.isArray(collisionBox) ? collisionBox[0] : collisionBox.left_top);
    const rightBottom = getPosition(Array.isArray(collisionBox) ? collisionBox[1] : collisionBox.right_bottom);
    return Math.ceil(rightBottom.x - leftTop.x) * Math.ceil(rightBottom.y - leftTop.y);
}

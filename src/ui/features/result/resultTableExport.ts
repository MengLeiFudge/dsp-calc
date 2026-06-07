import {strToU8, zipSync} from 'fflate';
import {getGrossOutput} from './resultGraphHelpers';
import {getMineralizedItemNames} from '@engine/calculation/mineralizeState';
import type {GlobalState} from '@engine/calculation/globalState';
import type {
    GameData,
    ItemGraph,
    NaturalProductionLineRow,
    NumericMap,
    RecipeData,
    ResultRowViewModel,
    Settings
} from '@engine/types/domain';

const SHEET_NAME = '计算器导出sheet';
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DETAIL_HEADER_ROW_INDEX = 16;

const STYLE_DEFAULT = 0;
const STYLE_SECTION = 1;
const STYLE_TABLE_HEADER = 2;
const STYLE_WRAP = 3;

type CellValue = string | number;

interface StyledCell {
    value: CellValue;
    style?: number;
}

type WorksheetCell = StyledCell | CellValue | null | undefined;
type WorksheetRow = WorksheetCell[];

interface NamedAmount {
    name: string;
    amount: number;
}

interface ExportDetailRow {
    item: string;
    outputAmount: number;
    factoryName: string;
    factoryNumber: number | '';
    ingredients: string;
    time: string;
    products: string;
    proliferatorCost: string;
    proliferatorMode: string;
    proliferatorItem: string;
}

export interface CalculatorTableExportData {
    targets: NamedAmount[];
    buildingStats: NamedAmount[];
    mineralizedItems: string[];
    rawMaterials: NamedAmount[];
    energyCost: number;
    totalEnergyCost: number;
    fixedNum: number;
    detailRows: ExportDetailRow[];
}

export interface CalculatorTableExportSource {
    globalState: GlobalState;
    needsList: NumericMap;
    resultDict: NumericMap;
    rowViewModels: ResultRowViewModel[];
    buildingList: NumericMap;
    rawMaterialList: NumericMap;
    energyCost: number;
    minerEnergyCost: number;
    fixedNum: number;
    itemGraph: ItemGraph;
    naturalProductionLine: NaturalProductionLineRow[];
    timeTick: number;
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function formatNumber(value: number, digits: number): string {
    if (!Number.isFinite(value)) {
        return '';
    }
    if (value !== 0 && Math.abs(value) < 0.001) {
        return value.toExponential(3).replace(/0+e/, 'e');
    }
    const fixed = value.toFixed(Math.max(0, digits));
    return fixed.replace(/\.?0+$/, '') || '0';
}

function formatAmountItem(amount: number, item: string, digits: number): string {
    return `${formatNumber(amount, digits)}*${item}`;
}

function formatItemAmountList(items: NumericMap, digits: number): string {
    return Object.entries(items)
        .filter(([, amount]) => Math.abs(Number(amount || 0)) >= 1e-9)
        .map(([item, amount]) => `${item}*${formatNumber(Number(amount), digits)}`)
        .join(' + ');
}

function subtractItemAmounts(source: NumericMap, amountsToSubtract: NumericMap): NumericMap {
    const result = {...source};
    Object.entries(amountsToSubtract).forEach(([item, amount]) => {
        result[item] = Number(result[item] || 0) - Number(amount || 0);
        if (Math.abs(result[item]) < 1e-9) {
            delete result[item];
        }
    });
    return result;
}

function getProliferatorModeText(mode: number): string {
    return ({
        0: '无',
        1: '加速',
        2: '增产',
        3: '接收站透镜喷涂',
        4: '增产分馏',
    } as Record<number, string>)[mode] || `${mode}`;
}

function getProliferatorItemText(gameData: GameData, mode: number, points: number): string {
    if (mode === 0 || points === 0) {
        return '无';
    }
    const proliferator = gameData.proliferator_data.find(entry => entry["增产点数"] === points);
    return proliferator?.["名称"] || `${points} 点`;
}

function getProliferatorCost({
    globalState,
    baseRecipe,
    mode,
    points,
}: {
    globalState: GlobalState;
    baseRecipe: RecipeData;
    mode: number;
    points: number;
}): NumericMap {
    if (!mode || !points || globalState.proliferator_price[points] === -1) {
        return {};
    }

    const materialTotal = Object.entries(baseRecipe["原料"]).reduce((sum, [item, count]) => {
        const supplyPoints = globalState.snapshot.external_supply_proliferator_points[item] ?? 0;
        if (supplyPoints > 0 && supplyPoints >= points) {
            return sum;
        }
        return sum + Number(count || 0);
    }, 0);

    const proliferatorPrice = globalState.proliferator_price[points] as NumericMap;
    return Object.fromEntries(
        Object.entries(proliferatorPrice).map(([item, count]) => [item, Number(count || 0) * materialTotal])
    );
}

function getRecipeTextParts(recipe: RecipeData, proliferatorCost: NumericMap): Pick<ExportDetailRow, 'ingredients' | 'time' | 'products' | 'proliferatorCost'> {
    const ingredientData = subtractItemAmounts(recipe["原料"], proliferatorCost);
    return {
        ingredients: formatItemAmountList(ingredientData, 3),
        time: `${formatNumber(recipe["时间"], 3)}s`,
        products: formatItemAmountList(recipe["产物"], 3),
        proliferatorCost: formatItemAmountList(proliferatorCost, 3),
    };
}

function buildNaturalLineExportRow({
    globalState,
    row,
    timeTick,
}: {
    globalState: GlobalState;
    row: NaturalProductionLineRow;
    timeTick: number;
}): ExportDetailRow {
    const recipeId = globalState.item_data[row["目标物品"]][row["配方id"]];
    const baseRecipe = globalState.effective_game_data.recipe_data[recipeId];
    const factoryInfo = globalState.effective_game_data.factory_data[baseRecipe["设施"]][row["建筑"]];
    const recipe = globalState.get_equivalent_recipe_for_natural_line(row);
    const outputAmount = recipe["时间"] > 0
        ? Number(recipe["产物"][row["目标物品"]] || 0) * row["建筑数量"] * timeTick / recipe["时间"]
        : 0;
    const proliferatorCost = getProliferatorCost({
        globalState,
        baseRecipe,
        mode: row["增产模式"],
        points: row["增产点数"],
    });
    const recipeParts = getRecipeTextParts(recipe, proliferatorCost);

    return {
        item: row["目标物品"],
        outputAmount,
        factoryName: factoryInfo["名称"],
        factoryNumber: row["建筑数量"],
        ...recipeParts,
        proliferatorMode: getProliferatorModeText(row["增产模式"]),
        proliferatorItem: getProliferatorItemText(globalState.effective_game_data, row["增产模式"], row["增产点数"]),
    };
}

function buildResultExportRow({
    globalState,
    itemGraph,
    resultDict,
    row,
    timeTick,
}: {
    globalState: GlobalState;
    itemGraph: ItemGraph;
    resultDict: NumericMap;
    row: ResultRowViewModel;
    timeTick: number;
}): ExportDetailRow {
    const resultAmount = Number(resultDict[row.item_name] || 0);
    const outputAmount = getGrossOutput(resultAmount, itemGraph, row.item_name);

    if (row.is_mineralized) {
        const recipeParts = getRecipeTextParts({
            名称: `${row.item_name}原矿化补充`,
            原料: {},
            产物: {[row.item_name]: outputAmount},
            设施: 0,
            时间: timeTick,
            增产: 0,
        }, {});

        return {
            item: row.item_name,
            outputAmount,
            factoryName: '',
            factoryNumber: '',
            ...recipeParts,
            proliferatorMode: '无',
            proliferatorItem: '无',
        };
    }

    const baseRecipe = globalState.effective_game_data.recipe_data[row.recipe_id];
    const recipe = globalState.get_equivalent_recipe_for_recipe(row.item_name, row.recipe_id);
    const proliferatorCost = getProliferatorCost({
        globalState,
        baseRecipe,
        mode: row.proliferator_mode,
        points: row.proliferator_points,
    });
    const recipeParts = getRecipeTextParts(recipe, proliferatorCost);

    return {
        item: row.item_name,
        outputAmount,
        factoryName: row.factory_name,
        factoryNumber: row.factory_number,
        ...recipeParts,
        proliferatorMode: getProliferatorModeText(row.proliferator_mode),
        proliferatorItem: getProliferatorItemText(globalState.effective_game_data, row.proliferator_mode, row.proliferator_points),
    };
}

function mapAmountEntries(source: NumericMap): NamedAmount[] {
    return Object.entries(source)
        .filter(([, amount]) => Math.abs(Number(amount || 0)) >= 1e-9)
        .map(([name, amount]) => ({name, amount: Number(amount || 0)}));
}

function getMineralizedItems(settings: Settings): string[] {
    return getMineralizedItemNames(settings.mineralize_list);
}

export function buildCalculatorTableExportData(source: CalculatorTableExportSource): CalculatorTableExportData {
    const settings = source.globalState.settings;
    const detailRows = [
        ...source.naturalProductionLine.map(row => buildNaturalLineExportRow({
            globalState: source.globalState,
            row,
            timeTick: source.timeTick,
        })),
        ...source.rowViewModels.map(row => buildResultExportRow({
            globalState: source.globalState,
            itemGraph: source.itemGraph,
            resultDict: source.resultDict,
            row,
            timeTick: source.timeTick,
        })),
    ];

    return {
        targets: mapAmountEntries(source.needsList),
        buildingStats: mapAmountEntries(source.buildingList),
        mineralizedItems: getMineralizedItems(settings),
        rawMaterials: mapAmountEntries(source.rawMaterialList),
        energyCost: source.energyCost,
        totalEnergyCost: source.energyCost + source.minerEnergyCost,
        fixedNum: source.fixedNum,
        detailRows,
    };
}

function styled(value: CellValue, style: number): StyledCell {
    return {value, style};
}

function buildExportRows(data: CalculatorTableExportData): WorksheetRow[] {
    const rows: WorksheetRow[] = [];
    const targetCells = data.targets.length > 0
        ? data.targets.map(({name, amount}) => formatAmountItem(amount, name, data.fixedNum))
        : ['无'];

    rows.push([null, ...targetCells.map((_target, index) => styled(`目标产物${index + 1}`, STYLE_SECTION))]);
    rows.push([styled('目标产物', STYLE_SECTION), ...targetCells]);
    rows.push([]);

    const buildingRows = data.buildingStats.length > 0
        ? data.buildingStats.map(({name, amount}) => [name, formatNumber(amount, 0)] as [string, string])
        : [['无', '']];
    const rawRows: Array<[string, string]> = [
        ['原矿化列表', data.mineralizedItems.length > 0 ? data.mineralizedItems.join('、') : '无'],
        ['原料统计', '产量'],
        ...data.rawMaterials.map(({name, amount}) => [name, formatNumber(amount, data.fixedNum)] as [string, string]),
    ];
    const topRows = Math.max(buildingRows.length + 1, rawRows.length);

    for (let i = 0; i < topRows; i++) {
        const building = i === 0 ? ['建筑统计', '数量'] : buildingRows[i - 1];
        const raw = rawRows[i];
        rows.push([
            building ? styled(building[0], i === 0 ? STYLE_SECTION : STYLE_DEFAULT) : null,
            building ? styled(building[1], i === 0 ? STYLE_SECTION : STYLE_DEFAULT) : null,
            null,
            raw ? styled(raw[0], i <= 1 ? STYLE_SECTION : STYLE_DEFAULT) : null,
            raw ? styled(raw[1], i <= 1 ? STYLE_SECTION : STYLE_DEFAULT) : null,
        ]);
    }

    rows.push([]);
    rows.push([styled('预估电力（不含采集）', STYLE_SECTION), `${formatNumber(data.energyCost, 3)} MW`]);
    rows.push([styled('预估电力（含采集）', STYLE_SECTION), `${formatNumber(data.totalEnergyCost, 3)} MW`]);

    while (rows.length < DETAIL_HEADER_ROW_INDEX - 1) {
        rows.push([]);
    }

    rows.push([
        '物品',
        '产能',
        '工厂类型',
        '工厂数量',
        '原料',
        '耗时',
        '产物',
        '增产剂消耗',
        '增产模式',
        '增产剂',
    ].map(header => styled(header, STYLE_TABLE_HEADER)));

    data.detailRows.forEach(row => {
        rows.push([
            row.item,
            formatNumber(row.outputAmount, data.fixedNum),
            row.factoryName,
            row.factoryNumber === '' ? '' : formatNumber(row.factoryNumber, data.fixedNum),
            styled(row.ingredients, STYLE_WRAP),
            row.time,
            styled(row.products, STYLE_WRAP),
            styled(row.proliferatorCost, STYLE_WRAP),
            row.proliferatorMode,
            row.proliferatorItem,
        ]);
    });

    return rows;
}

function getColumnName(index: number): string {
    let current = index;
    let name = '';
    while (current > 0) {
        const remainder = (current - 1) % 26;
        name = String.fromCharCode(65 + remainder) + name;
        current = Math.floor((current - 1) / 26);
    }
    return name;
}

function normalizeCell(cell: WorksheetCell): StyledCell | null {
    if (cell === null || cell === undefined) {
        return null;
    }
    if (typeof cell === 'object') {
        return cell;
    }
    return {value: cell};
}

function renderCell(cell: WorksheetCell, rowIndex: number, columnIndex: number): string {
    const normalizedCell = normalizeCell(cell);
    if (!normalizedCell || normalizedCell.value === '') {
        return '';
    }

    const ref = `${getColumnName(columnIndex)}${rowIndex}`;
    const styleAttr = normalizedCell.style ? ` s="${normalizedCell.style}"` : '';

    if (typeof normalizedCell.value === 'number') {
        return `<c r="${ref}"${styleAttr}><v>${normalizedCell.value}</v></c>`;
    }

    return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t>${escapeXml(String(normalizedCell.value))}</t></is></c>`;
}

function renderWorksheet(rows: WorksheetRow[]): string {
    const maxColumn = Math.max(1, ...rows.map(row => row.length));
    const dimension = `A1:${getColumnName(maxColumn)}${Math.max(rows.length, 1)}`;
    const columnWidths = [16, 14, 18, 14, 36, 12, 36, 18, 14, 18];
    const cols = columnWidths
        .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
        .join('');
    const sheetData = rows.map((row, rowIndex) => {
        const rowNumber = rowIndex + 1;
        const cells = row.map((cell, columnIndex) => renderCell(cell, rowNumber, columnIndex + 1)).join('');
        return cells ? `<row r="${rowNumber}" spans="1:${maxColumn}">${cells}</row>` : `<row r="${rowNumber}"/>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr/>
<dimension ref="${dimension}"/>
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultColWidth="9" defaultRowHeight="18"/>
<cols>${cols}</cols>
<sheetData>${sheetData}</sheetData>
<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="portrait"/>
</worksheet>`;
}

function buildStylesXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3">
<font><sz val="11"/><color theme="1"/><name val="宋体"/><charset val="134"/></font>
<font><b/><sz val="11"/><color theme="1"/><name val="宋体"/><charset val="134"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="宋体"/><charset val="134"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF5B9BD5"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFB2B2B2"/></left><right style="thin"><color rgb="FFB2B2B2"/></right><top style="thin"><color rgb="FFB2B2B2"/></top><bottom style="thin"><color rgb="FFB2B2B2"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"><alignment vertical="center"/></xf></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="${STYLE_DEFAULT}" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="常规" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function buildWorkbookXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView windowWidth="24750" windowHeight="17330"/></bookViews>
<sheets><sheet name="${escapeXml(SHEET_NAME)}" sheetId="1" r:id="rId1"/></sheets>
<calcPr calcId="191029"/>
</workbook>`;
}

function buildWorkbookRelsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function buildRootRelsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildContentTypesXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function buildCorePropsXml(createdAt: string): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:creator>dsp-calc</dc:creator>
<cp:lastModifiedBy>dsp-calc</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified>
</cp:coreProperties>`;
}

function buildAppPropsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>dsp-calc</Application>
<DocSecurity>0</DocSecurity>
<ScaleCrop>false</ScaleCrop>
<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>工作表</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>
<TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>${escapeXml(SHEET_NAME)}</vt:lpstr></vt:vector></TitlesOfParts>
</Properties>`;
}

export function buildCalculatorExportWorkbook(data: CalculatorTableExportData): Uint8Array {
    const rows = buildExportRows(data);
    const createdAt = new Date().toISOString();
    const files: Record<string, Uint8Array> = {
        '[Content_Types].xml': strToU8(buildContentTypesXml()),
        '_rels/.rels': strToU8(buildRootRelsXml()),
        'docProps/app.xml': strToU8(buildAppPropsXml()),
        'docProps/core.xml': strToU8(buildCorePropsXml(createdAt)),
        'xl/_rels/workbook.xml.rels': strToU8(buildWorkbookRelsXml()),
        'xl/workbook.xml': strToU8(buildWorkbookXml()),
        'xl/styles.xml': strToU8(buildStylesXml()),
        'xl/worksheets/sheet1.xml': strToU8(renderWorksheet(rows)),
    };

    return zipSync(files, {level: 6});
}

function buildExportFileName(): string {
    const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, '');
    return `dsp-calc-${timestamp}.xlsx`;
}

export function downloadCalculatorTableExport(data: CalculatorTableExportData): void {
    const workbook = buildCalculatorExportWorkbook(data);
    const workbookBuffer = workbook.buffer.slice(workbook.byteOffset, workbook.byteOffset + workbook.byteLength) as ArrayBuffer;
    const blob = new Blob([workbookBuffer], {type: XLSX_MIME_TYPE});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = buildExportFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

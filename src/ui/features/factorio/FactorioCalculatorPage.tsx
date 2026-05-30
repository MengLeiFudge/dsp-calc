import {FaBoxOpen, FaDatabase, FaIndustry, FaProjectDiagram, FaWrench} from 'react-icons/fa';

const adapterCapabilities = [
    'recipe prototype',
    'resource + mining-drill',
    'recipe + crafting-machine',
];

const resultColumns = ['目标', '配方', '建筑', '速率'];

export function FactorioCalculatorPage() {
    return <div className="factorio-page calculator-main-stack">
        <div className="factorio-toolbar-row calculator-toolbar-row d-flex column-gap-4 row-gap-2 flex-wrap">
            <div className="factorio-toolbar-status">
                <FaIndustry/>
                <span>异星工厂</span>
                <span className="factorio-status-badge">初版</span>
            </div>
            <button className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1" disabled>
                <FaDatabase/>
                <span>导入 raw 包</span>
            </button>
            <button className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1" disabled>
                <FaBoxOpen/>
                <span>选择目标</span>
            </button>
        </div>

        <div className="factorio-layout">
            <section className="factorio-panel factorio-data-panel">
                <div className="factorio-panel-title">
                    <FaDatabase/>
                    <span>数据源</span>
                </div>
                <div className="factorio-kv-list">
                    <div>
                        <span>raw dump</span>
                        <strong>未导入</strong>
                    </div>
                    <div>
                        <span>locale</span>
                        <strong>未导入</strong>
                    </div>
                    <div>
                        <span>icon sprites</span>
                        <strong>未导入</strong>
                    </div>
                </div>
            </section>

            <section className="factorio-panel factorio-selection-panel">
                <div className="factorio-panel-title">
                    <FaWrench/>
                    <span>求解配置</span>
                </div>
                <div className="factorio-disabled-form">
                    <label>
                        <span>目标产物</span>
                        <button className="btn btn-outline-secondary btn-sm" disabled>等待数据</button>
                    </label>
                    <label>
                        <span>配方选择</span>
                        <button className="btn btn-outline-secondary btn-sm" disabled>等待数据</button>
                    </label>
                    <label>
                        <span>建筑选择</span>
                        <button className="btn btn-outline-secondary btn-sm" disabled>等待数据</button>
                    </label>
                </div>
            </section>

            <section className="factorio-panel factorio-adapter-panel">
                <div className="factorio-panel-title">
                    <FaProjectDiagram/>
                    <span>adapter 状态</span>
                </div>
                <div className="factorio-capability-list">
                    {adapterCapabilities.map(capability => <span key={capability}>{capability}</span>)}
                </div>
            </section>

            <section className="factorio-panel factorio-result-panel">
                <div className="factorio-panel-title">
                    <FaBoxOpen/>
                    <span>计算结果</span>
                </div>
                <div className="factorio-result-scroll">
                    <table className="table table-sm align-middle factorio-result-table">
                        <thead>
                        <tr>
                            {resultColumns.map(column => <th key={column}>{column}</th>)}
                        </tr>
                        </thead>
                        <tbody>
                        <tr>
                            <td colSpan={resultColumns.length}>等待 Factorio 数据导入链路接入</td>
                        </tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    </div>;
}

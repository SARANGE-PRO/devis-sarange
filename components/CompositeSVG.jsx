import { Fragment, useMemo } from 'react';
import { buildCompositeModuleConfig } from '@/lib/menuiserie';
import { normalizeCompositeComposition } from '@/lib/products';

const COLORS = {
  frameBorder: '#4A4A4A',
  glass: '#9BDBFE',
  glassBorder: '#666666',
  symbol: '#EF4444',
  handle: '#E5E7EB',
  handleBorder: '#999999',
  ventilation: '#334155',
  panelBorder: '#CCCCCC',
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const normalizeHexColor = (value = '') => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('#')) return null;
  if (trimmed.length === 4) {
    return `#${trimmed
      .slice(1)
      .split('')
      .map((character) => character + character)
      .join('')}`;
  }
  return trimmed.length === 7 ? trimmed : null;
};
const isLightColor = (value) => {
  const normalized = normalizeHexColor(value);
  if (!normalized) return false;

  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance >= 0.85;
};
const resolvePetitBoisColor = (frameColor) =>
  isLightColor(frameColor) ? '#CBD5E1' : frameColor || COLORS.frameBorder;

const getMetrics = (width, height) => {
  const scaleFactor = Math.max(width, height, 1) / 500;

  return {
    scaleFactor,
    outerFrame: 12 * scaleFactor,
    sashFrame: 18 * scaleFactor,
    shutterBoxHeight: 60 * scaleFactor,
    slatHeight: 8 * scaleFactor,
    railWidth: 8 * scaleFactor,
    gap: 2 * scaleFactor,
    traverse: 12 * scaleFactor,
    mGap: 6 * scaleFactor,
  };
};

const DecoCutouts = ({ x, y, width, height, scaleFactor }) => {
  const rectWidth = width * 0.3;
  const rectX = x + width * 0.15;
  const startY = y + height * 0.15;
  const blockHeight = height * 0.2;
  const gap = height * 0.05;

  return (
    <Fragment>
      {[0, 1, 2].map((index) => {
        const currentY = startY + index * (blockHeight + gap);
        const shiftX = index === 1 ? -(width * 0.05) : 0;

        return (
          <Fragment key={index}>
            <rect
              x={rectX + shiftX}
              y={currentY}
              width={rectWidth}
              height={blockHeight}
              fill={COLORS.glass}
              stroke={COLORS.frameBorder}
              strokeWidth={Math.max(1, scaleFactor)}
              rx={4 * scaleFactor}
            />
            {index < 2 && (
              <rect
                x={rectX + shiftX}
                y={currentY + blockHeight + gap * 0.1}
                width={rectWidth}
                height={gap * 0.8}
                fill="#A0A0A0"
                stroke={COLORS.frameBorder}
                strokeWidth={Math.max(1, scaleFactor)}
              />
            )}
          </Fragment>
        );
      })}
    </Fragment>
  );
};

const SymbolLayer = ({ symbol, x, y, width, height, scaleFactor }) => {
  const strokeWidth = Math.max(2, 2.5 * scaleFactor);
  const midX = x + width / 2;
  const midY = y + height / 2;

  if (symbol === 'cross') {
    return (
      <g stroke={COLORS.symbol} strokeWidth={strokeWidth} strokeLinecap="round" fill="none">
        <line x1={x} y1={y} x2={x + width} y2={y + height} />
        <line x1={x} y1={y + height} x2={x + width} y2={y} />
      </g>
    );
  }

  if (symbol === 'triangle-left') {
    return (
      <polyline
        points={`${x + width},${y} ${x},${midY} ${x + width},${y + height}`}
        fill="none"
        stroke={COLORS.symbol}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (symbol === 'triangle-right') {
    return (
      <polyline
        points={`${x},${y} ${x + width},${midY} ${x},${y + height}`}
        fill="none"
        stroke={COLORS.symbol}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (symbol === 'triangle-up') {
    return (
      <polyline
        points={`${x},${y + height} ${midX},${y} ${x + width},${y + height}`}
        fill="none"
        stroke={COLORS.symbol}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (
    symbol === 'arrow-left' ||
    symbol === 'arrow-right' ||
    symbol === 'arrow-left-outline' ||
    symbol === 'arrow-right-outline'
  ) {
    const dx = symbol.includes('left') ? -40 * scaleFactor : 40 * scaleFactor;
    const isFilled = !symbol.includes('outline');
    const startX = midX - dx / 2;
    const endX = startX + dx;
    const head = 12 * scaleFactor;
    const headDirection = dx < 0 ? -1 : 1;
    const headBaseX = endX - head * headDirection;
    const headTopY = midY - head / 2;
    const headBottomY = midY + head / 2;

    return (
      <g
        stroke={COLORS.symbol}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1={startX} y1={midY} x2={endX} y2={midY} />
        <polygon
          points={`${endX},${midY} ${headBaseX},${headTopY} ${headBaseX},${headBottomY}`}
          fill={isFilled ? COLORS.symbol : COLORS.glass}
          stroke={COLORS.symbol}
        />
      </g>
    );
  }

  return null;
};

const Handle = ({ position, x, y, width, height, scaleFactor, isSliding = false }) => {
  if (!position) return null;

  const bodyWidth = (isSliding ? 6 : 8) * scaleFactor;
  const bodyHeight = (isSliding ? 40 : 35) * scaleFactor;
  const offset = (isSliding ? 6 : 8) * scaleFactor;

  if (position === 'top') {
    const handleX = x + width / 2 - bodyHeight / 2;
    const handleY = y + 14 * scaleFactor;

    return (
      <rect
        x={handleX}
        y={handleY}
        width={bodyHeight}
        height={bodyWidth}
        fill={COLORS.handle}
        stroke={COLORS.handleBorder}
        strokeWidth={Math.max(1, scaleFactor)}
        rx={bodyWidth / 2}
      />
    );
  }

  const handleX =
    position === 'left' ? x + offset : x + width - bodyWidth - offset;
  const handleY = y + height / 2 - bodyHeight / 2;

  return (
    <rect
      x={handleX}
      y={handleY}
      width={bodyWidth}
      height={bodyHeight}
      fill={COLORS.handle}
      stroke={COLORS.handleBorder}
      strokeWidth={Math.max(1, scaleFactor)}
      rx={bodyWidth / 2}
    />
  );
};

const VentilationGrid = ({ x, y, width, scaleFactor }) => {
  const gridWidth = Math.min(100 * scaleFactor, width - 20 * scaleFactor);
  const gridHeight = 10 * scaleFactor;
  const gridX = x + width / 2 - gridWidth / 2;
  const gridY = y + 4 * scaleFactor;
  const step = 3 * scaleFactor;
  const lines = [];

  for (
    let currentY = gridY + step;
    currentY < gridY + gridHeight - step / 2;
    currentY += step
  ) {
    lines.push(currentY);
  }

  return (
    <g>
      <rect
        x={gridX}
        y={gridY}
        width={gridWidth}
        height={gridHeight}
        fill="#FFFFFF"
        stroke={COLORS.glassBorder}
        strokeWidth={Math.max(1, scaleFactor)}
        rx={2 * scaleFactor}
      />
      {lines.map((lineY) => (
        <line
          key={lineY}
          x1={gridX + 4 * scaleFactor}
          y1={lineY}
          x2={gridX + gridWidth - 4 * scaleFactor}
          y2={lineY}
          stroke={COLORS.ventilation}
          strokeWidth={Math.max(1, scaleFactor)}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
};

const PetitBoisLines = ({
  x,
  y,
  width,
  height,
  petitsBoisH = 0,
  petitsBoisV = 0,
  stroke,
  scaleFactor,
}) => {
  if (width <= 0 || height <= 0) return null;

  const horizontalCount = Math.max(0, Number.parseInt(petitsBoisH, 10) || 0);
  const verticalCount = Math.max(0, Number.parseInt(petitsBoisV, 10) || 0);

  if (horizontalCount === 0 && verticalCount === 0) return null;

  const strokeWidth = Math.max(3, 4 * scaleFactor);
  const horizontalSpacing = height / (horizontalCount + 1);
  const verticalSpacing = width / (verticalCount + 1);

  return (
    <g
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    >
      {Array.from({ length: horizontalCount }, (_, index) => {
        const lineY = y + horizontalSpacing * (index + 1);
        return <line key={`h-${index}`} x1={x} y1={lineY} x2={x + width} y2={lineY} />;
      })}
      {Array.from({ length: verticalCount }, (_, index) => {
        const lineX = x + verticalSpacing * (index + 1);
        return <line key={`v-${index}`} x1={lineX} y1={y} x2={lineX} y2={y + height} />;
      })}
    </g>
  );
};

const PanelContent = ({
  x,
  y,
  width,
  height,
  frameColor,
  panelType,
  sousBassement,
  petitsBoisH,
  petitsBoisV,
  metrics,
}) => {
  if (width <= 0 || height <= 0) return null;

  const strokeWidth = Math.max(1, metrics.scaleFactor);
  const isOpaquePanel = panelType === 'sandwich';
  const petitsBoisColor = resolvePetitBoisColor(frameColor);
  const renderPvcPanel = (panelX, panelY, panelWidth, panelHeight) => {
    if (panelWidth <= 0 || panelHeight <= 0) return null;

    const mouldingInset = Math.min(metrics.mGap, panelHeight / 2, panelWidth / 2);

    return (
      <Fragment>
        <rect
          x={panelX}
          y={panelY}
          width={panelWidth}
          height={panelHeight}
          fill="#FFFFFF"
          stroke={COLORS.frameBorder}
          strokeWidth={strokeWidth}
          rx={Math.max(2, 4 * metrics.scaleFactor)}
        />
        {panelHeight > mouldingInset * 2 && panelWidth > mouldingInset * 2 && (
          <rect
            x={panelX + mouldingInset}
            y={panelY + mouldingInset}
            width={panelWidth - mouldingInset * 2}
            height={panelHeight - mouldingInset * 2}
            fill="none"
            stroke={COLORS.panelBorder}
            strokeWidth={strokeWidth}
            rx={Math.max(2, 3 * metrics.scaleFactor)}
          />
        )}
      </Fragment>
    );
  };
  const renderGlassPane = (panelX, panelY, panelWidth, panelHeight) => {
    if (panelWidth <= 0 || panelHeight <= 0) return null;

    return (
      <Fragment>
        <rect
          x={panelX}
          y={panelY}
          width={panelWidth}
          height={panelHeight}
          fill={COLORS.glass}
          stroke={COLORS.glassBorder}
          strokeWidth={strokeWidth}
          rx={Math.max(2, 4 * metrics.scaleFactor)}
        />
        <PetitBoisLines
          x={panelX}
          y={panelY}
          width={panelWidth}
          height={panelHeight}
          petitsBoisH={petitsBoisH}
          petitsBoisV={petitsBoisV}
          stroke={petitsBoisColor}
          scaleFactor={metrics.scaleFactor}
        />
      </Fragment>
    );
  };

  if (panelType === 'deco') {
    return (
      <Fragment>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={frameColor}
          stroke={COLORS.frameBorder}
          strokeWidth={strokeWidth}
          rx={Math.max(2, 4 * metrics.scaleFactor)}
        />
        <DecoCutouts
          x={x}
          y={y}
          width={width}
          height={height}
          scaleFactor={metrics.scaleFactor}
        />
      </Fragment>
    );
  }

  const validSousBassement = clamp(
    sousBassement || 0,
    0,
    Math.max(0, height - 40 * metrics.scaleFactor)
  );

  if (validSousBassement > 0) {
    const traverseHeight = Math.min(metrics.traverse, height);
    const topGlassHeight = Math.max(0, height - validSousBassement - traverseHeight);
    const panelY = y + topGlassHeight + traverseHeight;

    return (
      <Fragment>
        {topGlassHeight > 0 &&
          (isOpaquePanel ? (
            renderPvcPanel(x, y, width, topGlassHeight)
          ) : (
            renderGlassPane(x, y, width, topGlassHeight)
          ))}
        <rect
          x={x}
          y={y + topGlassHeight}
          width={width}
          height={traverseHeight}
          fill={frameColor}
          stroke={COLORS.frameBorder}
          strokeWidth={strokeWidth}
        />
        {renderPvcPanel(x, panelY, width, validSousBassement)}
      </Fragment>
    );
  }

  return isOpaquePanel ? (
    renderPvcPanel(x, y, width, height)
  ) : (
    renderGlassPane(x, y, width, height)
  );
};

const CasementSash = ({
  sash,
  x,
  y,
  width,
  height,
  frameColor,
  panelType,
  sousBassement,
  metrics,
}) => {
  if (width <= 0 || height <= 0) return null;

  const outerStrokeWidth = Math.max(1, metrics.scaleFactor);
  const insetWidth = Math.max(0, width - metrics.gap * 2);
  const insetHeight = Math.max(0, height - metrics.gap * 2);
  const glassX = x + metrics.gap + metrics.sashFrame;
  const glassY = y + metrics.gap + metrics.sashFrame;
  const glassWidth = Math.max(0, width - metrics.gap * 2 - metrics.sashFrame * 2);
  const glassHeight = Math.max(0, height - metrics.gap * 2 - metrics.sashFrame * 2);

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={frameColor}
        stroke={COLORS.frameBorder}
        strokeWidth={outerStrokeWidth}
        rx={Math.max(2, 4 * metrics.scaleFactor)}
      />
      {insetWidth > 0 && insetHeight > 0 && (
        <rect
          x={x + metrics.gap}
          y={y + metrics.gap}
          width={insetWidth}
          height={insetHeight}
          fill={frameColor}
          stroke={COLORS.frameBorder}
          strokeWidth={Math.max(0.5, 0.5 * metrics.scaleFactor)}
          rx={Math.max(2, 3 * metrics.scaleFactor)}
        />
      )}
      <PanelContent
        x={glassX}
        y={glassY}
        width={glassWidth}
        height={glassHeight}
        frameColor={frameColor}
        panelType={panelType}
        sousBassement={sousBassement}
        petitsBoisH={metrics.scaleFactor ? sash.petitsBoisH : 0}
        petitsBoisV={metrics.scaleFactor ? sash.petitsBoisV : 0}
        metrics={metrics}
      />
      {sash.symbols.map((symbol) => (
        <SymbolLayer
          key={symbol}
          symbol={symbol}
          x={x}
          y={y}
          width={width}
          height={height}
          scaleFactor={metrics.scaleFactor}
        />
      ))}
      {sash.hasVentilation && panelType !== 'deco' && panelType !== 'sandwich' && (
        <VentilationGrid
          x={x}
          y={y}
          width={width}
          scaleFactor={metrics.scaleFactor}
        />
      )}
      <Handle
        position={sash.handle}
        x={x}
        y={y}
        width={width}
        height={height}
        scaleFactor={metrics.scaleFactor}
      />
    </g>
  );
};

const SlidingSash = ({
  sash,
  x,
  y,
  width,
  height,
  frameColor,
  panelType,
  sousBassement,
  metrics,
  index,
  totalSashes,
}) => {
  if (width <= 0 || height <= 0) return null;

  const overlap = 10 * metrics.scaleFactor;
  let adjustedX = x;
  let adjustedWidth = width;

  if (index > 0) {
    adjustedX -= overlap;
    adjustedWidth += overlap;
  } else if (totalSashes > 1) {
    adjustedWidth += overlap;
  }

  const strokeWidth = Math.max(1, metrics.scaleFactor);
  const glassX = adjustedX + metrics.sashFrame;
  const glassY = y + metrics.sashFrame;
  const glassWidth = Math.max(0, adjustedWidth - metrics.sashFrame * 2);
  const glassHeight = Math.max(0, height - metrics.sashFrame * 2);

  return (
    <g>
      <rect
        x={adjustedX}
        y={y}
        width={adjustedWidth}
        height={height}
        fill={frameColor}
        stroke={COLORS.frameBorder}
        strokeWidth={strokeWidth}
      />
      <PanelContent
        x={glassX}
        y={glassY}
        width={glassWidth}
        height={glassHeight}
        frameColor={frameColor}
        sousBassement={sousBassement}
        panelType={panelType}
        petitsBoisH={sash.petitsBoisH}
        petitsBoisV={sash.petitsBoisV}
        metrics={metrics}
      />
      {sash.symbols.map((symbol) => (
        <SymbolLayer
          key={symbol}
          symbol={symbol}
          x={glassX}
          y={glassY}
          width={glassWidth}
          height={glassHeight}
          scaleFactor={metrics.scaleFactor}
        />
      ))}
      <Handle
        position={sash.handle}
        x={adjustedX}
        y={y}
        width={adjustedWidth}
        height={height}
        scaleFactor={metrics.scaleFactor}
        isSliding
      />
    </g>
  );
};

const StandaloneShutter = ({ width, height, frameColor, solarPanel, metrics }) => {
  const strokeWidth = Math.max(1, metrics.scaleFactor);
  const slatX = metrics.railWidth;
  const slatY = metrics.shutterBoxHeight;
  const slatWidth = Math.max(0, width - metrics.railWidth * 2);
  const slatHeight = Math.max(0, height - metrics.shutterBoxHeight);
  const slatLines = [];

  for (
    let currentY = slatY + metrics.slatHeight;
    currentY < height;
    currentY += metrics.slatHeight
  ) {
    slatLines.push(currentY);
  }

  return (
    <g>
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="none"
        stroke={COLORS.frameBorder}
        strokeWidth={strokeWidth}
      />
      <rect
        x={0}
        y={0}
        width={width}
        height={metrics.shutterBoxHeight}
        fill={frameColor}
        stroke={COLORS.frameBorder}
        strokeWidth={strokeWidth}
      />
      {solarPanel && (
        <rect
          x={20 * metrics.scaleFactor}
          y={15 * metrics.scaleFactor}
          width={35 * metrics.scaleFactor}
          height={12 * metrics.scaleFactor}
          fill="#333333"
          rx={2 * metrics.scaleFactor}
        />
      )}
      <rect
        x={0}
        y={metrics.shutterBoxHeight}
        width={metrics.railWidth}
        height={Math.max(0, height - metrics.shutterBoxHeight)}
        fill={frameColor}
        stroke={COLORS.frameBorder}
        strokeWidth={strokeWidth}
      />
      <rect
        x={width - metrics.railWidth}
        y={metrics.shutterBoxHeight}
        width={metrics.railWidth}
        height={Math.max(0, height - metrics.shutterBoxHeight)}
        fill={frameColor}
        stroke={COLORS.frameBorder}
        strokeWidth={strokeWidth}
      />
      <rect
        x={slatX}
        y={slatY}
        width={slatWidth}
        height={slatHeight}
        fill={frameColor}
        stroke={COLORS.frameBorder}
        strokeWidth={strokeWidth}
      />
      {slatLines.map((lineY) => (
        <line
          key={lineY}
          x1={slatX}
          y1={lineY}
          x2={slatX + slatWidth}
          y2={lineY}
          stroke="#999999"
          strokeWidth={Math.max(0.5, 0.5 * metrics.scaleFactor)}
        />
      ))}
    </g>
  );
};

const CompositeModule = ({ module, frameColor }) => {
  const config = buildCompositeModuleConfig({
    module,
    options: { svgColor: frameColor },
  });

  if (!config) return null;

  const metrics = getMetrics(config.width, config.height);

  if (config.type === 'volet') {
    return (
      <StandaloneShutter
        width={config.width}
        height={config.height}
        frameColor={config.frameColor}
        solarPanel={config.solarPanel}
        metrics={metrics}
      />
    );
  }

  const innerX = metrics.outerFrame;
  const innerY = metrics.outerFrame;
  const innerWidth = Math.max(0, config.width - metrics.outerFrame * 2);
  const innerHeight = Math.max(0, config.height - metrics.outerFrame * 2);
  const outerStrokeWidth = Math.max(1, metrics.scaleFactor);
  const rawTotalRatio = config.sashes.reduce(
    (total, sash) => total + (Number.isFinite(sash?.ratio) ? sash.ratio : 0),
    0
  );
  const totalRatio = rawTotalRatio > 0 ? rawTotalRatio : config.sashes.length || 1;

  const sashSegments = config.sashes.reduce(
    (state, sash, index) => {
      const fallbackRatio = 1 / Math.max(config.sashes.length, 1);
      const baseRatio =
        Number.isFinite(sash?.ratio) && sash.ratio > 0 ? sash.ratio : fallbackRatio;
      const normalizedRatio = rawTotalRatio > 0 ? baseRatio / totalRatio : fallbackRatio;
      const isLast = index === config.sashes.length - 1;
      const sashWidth = isLast
        ? innerX + innerWidth - state.currentX
        : innerWidth * normalizedRatio;

      return {
        currentX: state.currentX + sashWidth,
        segments: [
          ...state.segments,
          {
            key: `${module.id}-${index}`,
            index,
            sash,
            x: state.currentX,
            width: sashWidth,
          },
        ],
      };
    },
    { currentX: innerX, segments: [] }
  ).segments;

  return (
    <g>
      <rect
        x={0}
        y={0}
        width={config.width}
        height={config.height}
        fill={config.frameColor}
        stroke={COLORS.frameBorder}
        strokeWidth={outerStrokeWidth}
        rx={10 * metrics.scaleFactor}
      />
      {sashSegments.length === 0 ? (
        <rect
          x={innerX}
          y={innerY}
          width={innerWidth}
          height={innerHeight}
          fill={COLORS.glass}
          stroke={COLORS.glassBorder}
          strokeWidth={outerStrokeWidth}
        />
      ) : (
        sashSegments.map((segment) =>
          config.type === 'coulissant' ? (
            <SlidingSash
              key={segment.key}
              sash={{
                ...segment.sash,
                petitsBoisH: config.petitsBoisH,
                petitsBoisV: config.petitsBoisV,
              }}
              x={segment.x}
              y={innerY}
              width={segment.width}
              height={innerHeight}
              frameColor={config.frameColor}
              panelType={config.panelType}
              sousBassement={config.sousBassement}
              metrics={metrics}
              index={segment.index}
              totalSashes={sashSegments.length}
            />
          ) : (
            <CasementSash
              key={segment.key}
              sash={{
                ...segment.sash,
                petitsBoisH: config.petitsBoisH,
                petitsBoisV: config.petitsBoisV,
              }}
              x={segment.x}
              y={innerY}
              width={segment.width}
              height={innerHeight}
              frameColor={config.frameColor}
              panelType={config.panelType}
              sousBassement={config.sousBassement}
              metrics={metrics}
            />
          )
        )
      )}
    </g>
  );
};

export default function CompositeSVG({
  composition = [],
  frameColor = '#FFFFFF',
  className = '',
}) {
  const layout = useMemo(() => {
    const rawModuleById = new Map(
      (Array.isArray(composition) ? composition : []).flatMap((row) =>
        Array.isArray(row?.modules)
          ? row.modules.map((module) => [module.id, module])
          : []
      )
    );

    const rows = normalizeCompositeComposition(composition);
    const normalizedRows = rows.reduce(
      (accumulator, row) => {
        const rowHeight = row.modules.reduce((maxHeight, rowModule) => {
          const moduleHeight =
            Number.parseInt(rowModule?.heightMm ?? rowModule?.hauteur, 10) || 0;
          return Math.max(maxHeight, moduleHeight);
        }, 0);

        const moduleAccumulator = row.modules.reduce(
          (rowState, rowModule) => {
            const widthMm =
              Number.parseInt(rowModule?.widthMm ?? rowModule?.largeur, 10) || 0;
            const heightMm =
              Number.parseInt(rowModule?.heightMm ?? rowModule?.hauteur, 10) || rowHeight;

            rowState.modules.push({
              module: {
                ...(rawModuleById.get(rowModule.id) || {}),
                ...rowModule,
              },
              x: rowState.currentX,
              y: accumulator.currentY + Math.max(0, rowHeight - heightMm),
              widthMm,
              heightMm,
            });
            rowState.currentX += widthMm;
            return rowState;
          },
          { currentX: 0, modules: [] }
        );

        accumulator.rows.push({
          id: row.id,
          y: accumulator.currentY,
          widthMm: moduleAccumulator.currentX,
          heightMm: rowHeight,
          modules: moduleAccumulator.modules,
        });
        accumulator.currentY += rowHeight;
        return accumulator;
      },
      { currentY: 0, rows: [] }
    ).rows;

    return {
      rows: normalizedRows,
      totalWidth: normalizedRows.reduce(
        (maxWidth, row) => Math.max(maxWidth, row.widthMm),
        0
      ),
      totalHeight: normalizedRows.reduce(
        (totalHeight, row) => totalHeight + row.heightMm,
        0
      ),
    };
  }, [composition]);

  if (!layout.rows.length || layout.totalWidth <= 0 || layout.totalHeight <= 0) {
    return null;
  }

  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50/50 p-4 ${className}`}
    >
      <svg
        viewBox={`0 0 ${layout.totalWidth} ${layout.totalHeight}`}
        className="h-full w-full max-h-full max-w-full object-contain drop-shadow-md"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Apercu du chassis compose"
      >
        {layout.rows.map((row) =>
          row.modules.map((moduleLayout) => (
            <g
              key={moduleLayout.module.id}
              transform={`translate(${moduleLayout.x}, ${moduleLayout.y})`}
            >
              <CompositeModule
                module={moduleLayout.module}
                frameColor={moduleLayout.module?.svgColor || frameColor}
              />
            </g>
          ))
        )}
      </svg>
    </div>
  );
}

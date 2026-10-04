import { useEffect, useMemo, useState } from 'react';
import { IonSpinner } from '@ionic/react';
import { supabase } from '../lib/supabaseClient';
import { dashboardMarketStatsSchema } from '../lib/supabaseSchemas';
import './ProfessionalDashboard.css';

interface Props {
  userId: string;
}

type BookingStatus = 'solicitado' | 'aceptado' | 'en_curso' | 'completado' | 'cancelado';

const STATUS_ORDER: { status: BookingStatus; label: string }[] = [
  { status: 'solicitado', label: 'Solicitado' },
  { status: 'aceptado', label: 'Aceptado' },
  { status: 'en_curso', label: 'En curso' },
  { status: 'completado', label: 'Completado' },
  { status: 'cancelado', label: 'Cancelado' },
];

// Tramo principal del flujo (sin "cancelado", que es una salida, no una etapa).
const FUNNEL_ORDER: { status: BookingStatus; label: string }[] = [
  { status: 'solicitado', label: 'Solicitado' },
  { status: 'aceptado', label: 'Aceptado' },
  { status: 'en_curso', label: 'En curso' },
  { status: 'completado', label: 'Completado' },
];

const MONTH_LABELS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

interface BookingRow {
  status: BookingStatus;
  price_agreed: number | null;
  created_at: string;
}

interface ServiceRow {
  category_id: number;
  price: number;
  professional_id: string;
}

// Precio promedio del mercado por categoría (sin el propio usuario), ya agregado en la DB.
type MarketPriceByCategory = Map<number, number>;

function buildMonthlyBuckets(bookings: BookingRow[], predicate: (b: BookingRow) => boolean, valueOf: (b: BookingRow) => number) {
  const now = new Date();
  const buckets: { key: string; label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTH_LABELS[d.getMonth()], value: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const b of bookings) {
    if (!predicate(b)) continue;
    const d = new Date(b.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.value += valueOf(b);
  }
  return buckets;
}

const ProfessionalDashboard: React.FC<Props> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [ratingAvg, setRatingAvg] = useState<number | null>(null);
  const [ratingCount, setRatingCount] = useState(0);
  const [marketRatingAvg, setMarketRatingAvg] = useState<number | null>(null);
  const [activeServices, setActiveServices] = useState(0);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [ingresosAprox, setIngresosAprox] = useState(0);
  const [ownServices, setOwnServices] = useState<ServiceRow[]>([]);
  const [marketPriceByCategory, setMarketPriceByCategory] = useState<MarketPriceByCategory>(new Map());
  const [categoryNames, setCategoryNames] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    const load = async () => {
      // Los agregados de mercado vienen calculados por la DB (RPC); antes se descargaban TODA la tabla
      // de calificaciones y TODOS los servicios activos para promediarlos acá.
      const [ownRatingResult, servicesResult, bookingsResult, marketStatsResult, categoriesResult] = await Promise.all([
        supabase
          .from('professional_ratings')
          .select('rating_avg, rating_count')
          .eq('professional_id', userId)
          .maybeSingle(),
        supabase
          .from('services')
          .select('category_id, price')
          .eq('professional_id', userId)
          .eq('is_active', true),
        supabase
          .from('bookings')
          .select('status, price_agreed, created_at')
          .eq('professional_id', userId),
        supabase.rpc('dashboard_market_stats'),
        supabase.from('categories').select('id, name'),
      ]);

      setRatingAvg(ownRatingResult.data?.rating_avg ?? null);
      setRatingCount(ownRatingResult.data?.rating_count ?? 0);

      const marketStats = dashboardMarketStatsSchema.safeParse(marketStatsResult.data);
      if (marketStats.success) {
        setMarketRatingAvg(marketStats.data.market_rating_avg);
        setMarketPriceByCategory(new Map(marketStats.data.price_by_category.map((c) => [c.category_id, c.avg_price])));
      } else {
        console.error('[Dashboard] market stats inválidas', marketStatsResult.error ?? marketStats.error);
      }

      const ownServiceRows = (servicesResult.data ?? []) as ServiceRow[];
      setActiveServices(ownServiceRows.length);
      setOwnServices(ownServiceRows.map((s) => ({ ...s, professional_id: userId })));
      setCategoryNames(new Map((categoriesResult.data ?? []).map((c) => [c.id, c.name])));

      const rows = (bookingsResult.data ?? []) as BookingRow[];
      setBookings(rows);
      setIngresosAprox(
        rows.filter((b) => b.status === 'completado').reduce((sum, b) => sum + (b.price_agreed ?? 0), 0),
      );

      setLoading(false);
    };

    load();

    // Sin esto, el panel solo se actualiza si se recarga la página - las pruebas
    // vía Postman (o cualquier otro cliente) no se reflejarían hasta un refresh manual.
    const channel = supabase
      .channel(`pro-dashboard-bookings-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `professional_id=eq.${userId}` },
        async () => {
          const { data } = await supabase
            .from('bookings')
            .select('status, price_agreed, created_at')
            .eq('professional_id', userId);

          const rows = (data ?? []) as BookingRow[];
          setBookings(rows);
          setIngresosAprox(
            rows.filter((b) => b.status === 'completado').reduce((sum, b) => sum + (b.price_agreed ?? 0), 0),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const countByStatus = useMemo(() => {
    const counts: Record<BookingStatus, number> = {
      solicitado: 0, aceptado: 0, en_curso: 0, completado: 0, cancelado: 0,
    };
    for (const b of bookings) counts[b.status] += 1;
    return counts;
  }, [bookings]);

  const totalSolicitudes = useMemo(
    () => Object.values(countByStatus).reduce((a, b) => a + b, 0),
    [countByStatus],
  );

  const solicitudesTrend = useMemo(
    () => buildMonthlyBuckets(bookings, () => true, () => 1),
    [bookings],
  );

  const ingresosTrend = useMemo(
    () => buildMonthlyBuckets(bookings, (b) => b.status === 'completado', (b) => b.price_agreed ?? 0),
    [bookings],
  );

  // Etapa alcanzada = está en esa etapa o ya avanzó más allá (se asume progresión lineal
  // solicitado -> aceptado -> en_curso -> completado; los cancelados no se pueden ubicar
  // en el camino sin un historial de transiciones, así que quedan fuera del embudo).
  const funnelStages = useMemo(() => {
    let cumulative = 0;
    const reachedByStatus = new Map<BookingStatus, number>();
    for (let i = FUNNEL_ORDER.length - 1; i >= 0; i--) {
      const { status } = FUNNEL_ORDER[i];
      cumulative += countByStatus[status];
      reachedByStatus.set(status, cumulative);
    }
    return FUNNEL_ORDER.map(({ status, label }) => ({ status, label, value: reachedByStatus.get(status) ?? 0 }));
  }, [countByStatus]);

  const priceComparison = useMemo(() => {
    const ownByCategory = new Map<number, number[]>();
    for (const s of ownServices) {
      const arr = ownByCategory.get(s.category_id) ?? [];
      arr.push(s.price);
      ownByCategory.set(s.category_id, arr);
    }

    const rows: { label: string; mine: number; market: number }[] = [];
    for (const [categoryId, prices] of ownByCategory) {
      const market = marketPriceByCategory.get(categoryId);
      if (market === undefined) continue;
      const mine = prices.reduce((a, b) => a + b, 0) / prices.length;
      rows.push({ label: categoryNames.get(categoryId) ?? 'Categoría', mine, market });
    }
    return rows;
  }, [ownServices, marketPriceByCategory, categoryNames]);

  if (loading) {
    return (
      <div className="ion-text-center ion-padding">
        <IonSpinner />
      </div>
    );
  }

  const hasIngresos = ingresosAprox > 0;
  const heroMetric = hasIngresos
    ? { value: `Q${ingresosAprox.toLocaleString('es-GT')}`, label: 'Ingresos aproximados (tratos completados)' }
    : { value: `${totalSolicitudes}`, label: totalSolicitudes > 0 ? 'Solicitudes recibidas en total' : 'Aún no tenés solicitudes' };

  return (
    <div className="pro-dashboard">
      <p className="pro-dashboard__greeting">Así va tu semana</p>

      <div className="pro-dashboard__hero app-hero">
        <div className="pro-dashboard__hero-value">{heroMetric.value}</div>
        <div className="pro-dashboard__hero-label">{heroMetric.label}</div>
      </div>

      <div className="pro-dashboard__stats">
        <div className="pro-dashboard__stat">
          <div className="pro-dashboard__stat-value">{ratingCount > 0 ? ratingAvg : '—'}</div>
          <div className="pro-dashboard__stat-label">
            {ratingCount > 0 ? `${ratingCount} reseña${ratingCount === 1 ? '' : 's'}` : 'Sin reseñas'}
          </div>
        </div>
        <div className="pro-dashboard__stat">
          <div className="pro-dashboard__stat-value">{activeServices}</div>
          <div className="pro-dashboard__stat-label">Servicios activos</div>
        </div>
      </div>

      <StatusRing counts={countByStatus} total={totalSolicitudes} />

      <ConversionFunnel stages={funnelStages} cancelados={countByStatus.cancelado} />

      <TrendChart
        title="Ingresos, mes a mes"
        data={ingresosTrend}
        emptyMessage="Todavía no hay tratos completados para mostrar una tendencia."
        formatValue={(v) => `Q${v.toLocaleString('es-GT')}`}
        variant="line"
        colorVar="--ion-color-secondary"
      />

      <BarTrendChart
        title="Solicitudes, mes a mes"
        data={solicitudesTrend}
        emptyMessage="Todavía no hay historial suficiente para una tendencia."
      />

      {ratingCount > 0 && marketRatingAvg !== null && (
        <CompareBars
          title="Tu calificación frente al mercado"
          rows={[{ label: 'Vos', value: ratingAvg ?? 0 }, { label: 'Mercado', value: marketRatingAvg }]}
          max={5}
          formatValue={(v) => v.toFixed(1)}
        />
      )}

      {priceComparison.length > 0 && <PriceDumbbell rows={priceComparison} />}
    </div>
  );
};

/* ---------- Anillo: solicitudes por estado ---------- */

const RING_RADIUS = 52;
const RING_STROKE = 15;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_GAP = 6; // px de separación visual entre segmentos

const StatusRing: React.FC<{ counts: Record<BookingStatus, number>; total: number }> = ({ counts, total }) => {
  const [active, setActive] = useState<BookingStatus | null>(null);

  let offsetAccum = 0;
  const segments = STATUS_ORDER.map(({ status, label }) => {
    const value = counts[status];
    const fraction = total > 0 ? value / total : 0;
    const rawLength = fraction * RING_CIRCUMFERENCE;
    const length = Math.max(rawLength - RING_GAP, 0);
    const offset = offsetAccum;
    offsetAccum += rawLength;
    const pct = total > 0 ? Math.round(fraction * 100) : 0;
    return { status, label, value, pct, length, offset };
  });

  return (
    <div className="pro-chart-card app-card">
      <p className="pro-chart-card__title">Tus solicitudes, de un vistazo</p>

      <div className="status-ring">
        <svg viewBox="0 0 140 140" className="status-ring__svg">
          <circle cx="70" cy="70" r={RING_RADIUS} className="status-ring__track" strokeWidth={RING_STROKE} fill="none" />
          {total > 0 && segments.map((s) => (
            <circle
              key={s.status}
              cx="70"
              cy="70"
              r={RING_RADIUS}
              fill="none"
              strokeWidth={active === s.status ? RING_STROKE + 3 : RING_STROKE}
              strokeDasharray={`${s.length} ${RING_CIRCUMFERENCE - s.length}`}
              strokeDashoffset={-s.offset}
              strokeLinecap="round"
              transform="rotate(-90 70 70)"
              className={`status-ring__seg status-ring__seg--${s.status}`}
              style={{ opacity: active && active !== s.status ? 0.35 : 1, cursor: s.value > 0 ? 'pointer' : 'default' }}
              tabIndex={s.value > 0 ? 0 : -1}
              role={s.value > 0 ? 'button' : undefined}
              aria-label={`${s.label}: ${s.value} (${s.pct}%)`}
              onMouseEnter={() => s.value > 0 && setActive(s.status)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => s.value > 0 && setActive(s.status)}
              onBlur={() => setActive(null)}
            />
          ))}
        </svg>
        <div className="status-ring__center">
          <span className="status-ring__center-value">
            {active ? segments.find((s) => s.status === active)?.value : total}
          </span>
          <span className="status-ring__center-label">
            {active ? STATUS_ORDER.find((s) => s.status === active)?.label : 'Total'}
          </span>
        </div>
      </div>

      {total === 0 ? (
        <p className="pro-chart-card__empty">Cuando un cliente te contacte, vas a ver el detalle acá.</p>
      ) : (
        <ul className="status-ring__legend">
          {segments.map((s) => (
            <li
              key={s.status}
              className={`status-ring__legend-item${active === s.status ? ' is-active' : ''}`}
              onMouseEnter={() => s.value > 0 && setActive(s.status)}
              onMouseLeave={() => setActive(null)}
              tabIndex={s.value > 0 ? 0 : -1}
              onFocus={() => s.value > 0 && setActive(s.status)}
              onBlur={() => setActive(null)}
            >
              <span className={`status-ring__dot status-ring__dot--${s.status}`} />
              <span className="status-ring__legend-label">{s.label}</span>
              <span className="status-ring__legend-value">{s.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/* ---------- Embudo de conversión ---------- */

const ConversionFunnel: React.FC<{ stages: { status: BookingStatus; label: string; value: number }[]; cancelados: number }> = ({ stages, cancelados }) => {
  const max = Math.max(stages[0]?.value ?? 0, 1);
  const total = stages[0]?.value ?? 0;

  return (
    <div className="pro-chart-card app-card">
      <p className="pro-chart-card__title">De solicitud a trato cerrado</p>

      {total === 0 ? (
        <p className="pro-chart-card__empty">Todavía no hay solicitudes para armar el embudo.</p>
      ) : (
        <>
          <div className="funnel">
            {stages.map((s) => {
              const widthPct = (s.value / max) * 100;
              const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
              return (
                <div className="funnel__row" key={s.status}>
                  <span className="funnel__label">{s.label}</span>
                  <div className="funnel__track">
                    <div className={`funnel__fill funnel__fill--${s.status}`} style={{ width: `${widthPct}%` }} />
                  </div>
                  <span className="funnel__value">{s.value} <span className="funnel__pct">({pct}%)</span></span>
                </div>
              );
            })}
          </div>
          {cancelados > 0 && (
            <p className="pro-chart-card__note">
              {cancelados} solicitud{cancelados === 1 ? '' : 'es'} se cancelaron en el camino.
            </p>
          )}
        </>
      )}
    </div>
  );
};

/* ---------- Tendencia mensual (genérica) ---------- */

const TrendChart: React.FC<{
  title: string;
  data: { key: string; label: string; value: number }[];
  emptyMessage: string;
  formatValue: (v: number) => string;
  variant: 'line';
  colorVar: string;
}> = ({ title, data, emptyMessage, formatValue, colorVar }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const width = 280;
  const height = 96;
  const padX = 12;
  const padY = 14;
  const max = Math.max(...data.map((d) => d.value), 1);

  const points = data.map((d, i) => {
    const x = padX + (i * (width - padX * 2)) / (data.length - 1);
    const y = height - padY - (d.value / max) * (height - padY * 2);
    return { ...d, x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padY} L ${points[0].x} ${height - padY} Z`;
  const totalValue = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="pro-chart-card app-card">
      <p className="pro-chart-card__title">{title}</p>

      {totalValue === 0 ? (
        <p className="pro-chart-card__empty">{emptyMessage}</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="trend-chart__svg"
            style={{ '--trend-color': `var(${colorVar})` } as React.CSSProperties}
          >
            <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} className="trend-chart__baseline" />
            <path d={areaPath} className="trend-chart__area" />
            <path d={linePath} className="trend-chart__line" />
            {points.map((p, i) => (
              <g key={p.key}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={hoverIdx === i ? 5 : 3.5}
                  className="trend-chart__dot"
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.label}: ${formatValue(p.value)}`}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                  onFocus={() => setHoverIdx(i)}
                  onBlur={() => setHoverIdx(null)}
                />
                <circle cx={p.x} cy={p.y} r={12} fill="transparent" onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} />
              </g>
            ))}
            {hoverIdx !== null && (
              <text x={points[hoverIdx].x} y={points[hoverIdx].y - 10} textAnchor="middle" className="trend-chart__value-label">
                {formatValue(points[hoverIdx].value)}
              </text>
            )}
          </svg>
          <div className="trend-chart__axis">
            {points.map((p, i) => (
              <span key={p.key} className={hoverIdx === i ? 'is-active' : ''}>{p.label}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/* ---------- Tendencia mensual en barras (para distinguirla de la de ingresos) ---------- */

const BarTrendChart: React.FC<{
  title: string;
  data: { key: string; label: string; value: number }[];
  emptyMessage: string;
}> = ({ title, data, emptyMessage }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="pro-chart-card app-card">
      <p className="pro-chart-card__title">{title}</p>

      {total === 0 ? (
        <p className="pro-chart-card__empty">{emptyMessage}</p>
      ) : (
        <div className="bar-trend">
          {data.map((d, i) => (
            <div
              key={d.key}
              className="bar-trend__col"
              tabIndex={0}
              role="button"
              aria-label={`${d.label}: ${d.value} solicitudes`}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              onFocus={() => setHoverIdx(i)}
              onBlur={() => setHoverIdx(null)}
            >
              {hoverIdx === i && <span className="bar-trend__value">{d.value}</span>}
              <div className="bar-trend__track">
                <div
                  className={`bar-trend__fill${hoverIdx === i ? ' is-active' : ''}`}
                  style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 6 : 0)}%` }}
                />
              </div>
              <span className={`bar-trend__label${hoverIdx === i ? ' is-active' : ''}`}>{d.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ---------- Comparativa genérica (vos vs. mercado) ---------- */

const CompareBars: React.FC<{
  title: string;
  rows: { label: string; value: number }[];
  max: number;
  formatValue: (v: number) => string;
}> = ({ title, rows, max, formatValue }) => (
  <div className="pro-chart-card app-card">
    <p className="pro-chart-card__title">{title}</p>

    <div className="rating-compare">
      {rows.map((row, i) => (
        <div className="rating-compare__row" key={row.label}>
          <span className="rating-compare__label">{row.label}</span>
          <div className="rating-compare__track">
            <div
              className={`rating-compare__fill ${i === 0 ? 'rating-compare__fill--mine' : 'rating-compare__fill--market'}`}
              style={{ width: `${max > 0 ? Math.min((row.value / max) * 100, 100) : 0}%` }}
            />
          </div>
          <span className="rating-compare__value">{formatValue(row.value)}</span>
        </div>
      ))}
    </div>
  </div>
);

/* ---------- Dumbbell: tus precios vs. el mercado, por categoría ---------- */

const PriceDumbbell: React.FC<{ rows: { label: string; mine: number; market: number }[] }> = ({ rows }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const max = Math.max(...rows.flatMap((r) => [r.mine, r.market]), 1) * 1.1;

  return (
    <div className="pro-chart-card app-card">
      <p className="pro-chart-card__title">Tus precios frente al mercado, por categoría</p>

      <div className="dumbbell__legend">
        <span><span className="dumbbell__dot dumbbell__dot--mine" /> Vos</span>
        <span><span className="dumbbell__dot dumbbell__dot--market" /> Mercado</span>
      </div>

      <div className="dumbbell">
        {rows.map((row, i) => {
          const minePct = (row.mine / max) * 100;
          const marketPct = (row.market / max) * 100;
          const left = Math.min(minePct, marketPct);
          const width = Math.abs(minePct - marketPct);
          return (
            <div
              key={row.label}
              className="dumbbell__row"
              tabIndex={0}
              role="button"
              aria-label={`${row.label}: vos Q${Math.round(row.mine)}, mercado Q${Math.round(row.market)}`}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              onFocus={() => setHoverIdx(i)}
              onBlur={() => setHoverIdx(null)}
            >
              <span className="dumbbell__label">{row.label}</span>
              <div className="dumbbell__track">
                <div className="dumbbell__connector" style={{ left: `${left}%`, width: `${width}%` }} />
                <div className="dumbbell__point dumbbell__point--market" style={{ left: `${marketPct}%` }} />
                <div className="dumbbell__point dumbbell__point--mine" style={{ left: `${minePct}%` }} />
              </div>
              {hoverIdx === i && (
                <span className="dumbbell__value">Q{Math.round(row.mine)} vs Q{Math.round(row.market)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProfessionalDashboard;

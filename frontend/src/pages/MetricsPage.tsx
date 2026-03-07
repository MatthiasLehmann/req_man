import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, PieChart, Pie, Cell, RadialBarChart, RadialBar,
  Tooltip, Legend, ResponsiveContainer, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { BarChart3, ArrowLeft, Loader2, CheckCircle, Link2, FileText, AlertCircle } from 'lucide-react';
import { getMetrics } from '../api/client';
import { ProjectMetrics, DocumentMetrics } from '../types';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  sub?: string;
}

function StatCard({ label, value, icon, color, sub }: StatCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg ${color.replace('text-', 'bg-').replace('-600', '-100')}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function MetricsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const { data: res, isLoading } = useQuery({
    queryKey: ['metrics', projectId],
    queryFn: () => getMetrics(projectId!),
    enabled: !!projectId,
  });
  const metrics: ProjectMetrics | undefined = res?.data;

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <button onClick={() => navigate('/')} className="btn-secondary">
          <ArrowLeft className="w-4 h-4" /> Zur Projektübersicht
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!metrics || metrics.total_items === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>Noch keine Daten vorhanden</p>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const docBarData = metrics.documents.map((d) => ({
    name: d.prefix,
    Gesamt: d.total,
    Aktiv: d.active,
    Normativ: d.normative,
    Reviewed: d.reviewed,
    Verlinkt: d.linked,
  }));

  const statusPieData = metrics.documents.reduce(
    (acc, d) => {
      acc[0].value += d.active;
      acc[1].value += d.inactive;
      return acc;
    },
    [{ name: 'Aktiv', value: 0 }, { name: 'Inaktiv', value: 0 }]
  );

  const reviewPieData = metrics.documents.reduce(
    (acc, d) => {
      acc[0].value += d.reviewed;
      acc[1].value += d.unreviewed;
      return acc;
    },
    [{ name: 'Reviewed', value: 0 }, { name: 'Ausstehend', value: 0 }]
  );

  const linkPieData = metrics.documents.reduce(
    (acc, d) => {
      acc[0].value += d.linked;
      acc[1].value += d.unlinked;
      return acc;
    },
    [{ name: 'Verlinkt', value: 0 }, { name: 'Unverlinkt', value: 0 }]
  );

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-primary-600" />
          <h2 className="text-xl font-bold text-gray-900">Projektmetriken</h2>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Anforderungen gesamt"
            value={metrics.total_items}
            icon={<FileText className="w-5 h-5 text-blue-600" />}
            color="text-blue-600"
            sub={`${metrics.total_documents} Dokumente`}
          />
          <StatCard
            label="Link-Abdeckung"
            value={`${metrics.link_coverage}%`}
            icon={<Link2 className="w-5 h-5 text-green-600" />}
            color="text-green-600"
            sub="mit Verlinkungen"
          />
          <StatCard
            label="Review-Abdeckung"
            value={`${metrics.review_coverage}%`}
            icon={<CheckCircle className="w-5 h-5 text-purple-600" />}
            color="text-purple-600"
            sub="reviewed"
          />
          <StatCard
            label="Dokumente"
            value={metrics.total_documents}
            icon={<AlertCircle className="w-5 h-5 text-orange-600" />}
            color="text-orange-600"
            sub={`${metrics.documents.filter(d => d.unlinked > 0).length} mit unverlinkten Items`}
          />
        </div>

        {/* Bar Chart: Items per Document */}
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Anforderungen pro Dokument</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={docBarData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Gesamt" fill="#e5e7eb" />
              <Bar dataKey="Aktiv" fill="#3b82f6" />
              <Bar dataKey="Normativ" fill="#10b981" />
              <Bar dataKey="Reviewed" fill="#8b5cf6" />
              <Bar dataKey="Verlinkt" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Charts Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PieChartCard title="Status" data={statusPieData} colors={['#10b981', '#d1d5db']} />
          <PieChartCard title="Review-Status" data={reviewPieData} colors={['#8b5cf6', '#fde68a']} />
          <PieChartCard title="Verlinkungen" data={linkPieData} colors={['#3b82f6', '#fca5a5']} />
        </div>

        {/* Document Details Table */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-800">Detailübersicht pro Dokument</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Dokument', 'Gesamt', 'Aktiv', 'Inaktiv', 'Normativ', 'Reviewed', 'Verlinkt', 'Abschnitte'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.documents.map((doc, idx) => (
                  <DocumentRow key={doc.prefix} doc={doc} color={COLORS[idx % COLORS.length]} />
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                  <td className="px-4 py-2 text-xs">Gesamt</td>
                  <td className="px-4 py-2 text-xs">{metrics.total_items}</td>
                  <td className="px-4 py-2 text-xs">{metrics.documents.reduce((a, d) => a + d.active, 0)}</td>
                  <td className="px-4 py-2 text-xs">{metrics.documents.reduce((a, d) => a + d.inactive, 0)}</td>
                  <td className="px-4 py-2 text-xs">{metrics.documents.reduce((a, d) => a + d.normative, 0)}</td>
                  <td className="px-4 py-2 text-xs">{metrics.documents.reduce((a, d) => a + d.reviewed, 0)}</td>
                  <td className="px-4 py-2 text-xs">{metrics.documents.reduce((a, d) => a + d.linked, 0)}</td>
                  <td className="px-4 py-2 text-xs">{metrics.documents.reduce((a, d) => a + d.headers, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function PieChartCard({ title, data, colors }: {
  title: string;
  data: { name: string; value: number }[];
  colors: string[];
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="card p-4">
      <h3 className="font-semibold text-gray-800 text-sm mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={75}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => [`${value} (${total ? Math.round(value / total * 100) : 0}%)`, '']} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-4 text-xs">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: colors[i % colors.length] }} />
            <span className="text-gray-600">{d.name}: <strong>{d.value}</strong></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentRow({ doc, color }: { doc: DocumentMetrics; color: string }) {
  const reviewPct = doc.total > 0 ? Math.round(doc.reviewed / doc.total * 100) : 0;
  const linkPct = doc.total > 0 ? Math.round(doc.linked / doc.total * 100) : 0;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-2">
        <span
          className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
          style={{ background: color }}
        >
          {doc.prefix}
        </span>
      </td>
      <td className="px-4 py-2 text-xs font-semibold">{doc.total}</td>
      <td className="px-4 py-2 text-xs text-green-700">{doc.active}</td>
      <td className="px-4 py-2 text-xs text-gray-400">{doc.inactive}</td>
      <td className="px-4 py-2 text-xs">{doc.normative}</td>
      <td className="px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span>{doc.reviewed}</span>
          <div className="flex-1 bg-gray-200 rounded-full h-1.5 w-12">
            <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${reviewPct}%` }} />
          </div>
          <span className="text-gray-400">{reviewPct}%</span>
        </div>
      </td>
      <td className="px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span>{doc.linked}</span>
          <div className="flex-1 bg-gray-200 rounded-full h-1.5 w-12">
            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${linkPct}%` }} />
          </div>
          <span className="text-gray-400">{linkPct}%</span>
        </div>
      </td>
      <td className="px-4 py-2 text-xs text-gray-500">{doc.headers}</td>
    </tr>
  );
}

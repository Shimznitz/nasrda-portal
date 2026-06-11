/*src/components/UnitCard.tsx*/

'use client';
import { useRouter } from 'next/navigation';

export default function UnitCard({ unit, onManage }: any) {
  const router = useRouter();
  return (
    <div className="unit-card" onClick={() => router.push(`/staff/units/${unit.id}`)}>
      <div className="unit-header">
        <h3>{unit.name}</h3>
        {unit.head_id && <span className="head-badge">Head Assigned</span>}
      </div>
      <p className="unit-desc">{unit.description || 'No description.'}</p>
      <div className="unit-footer">
        <span>👥 {unit.profiles?.length || 0} Members</span>
        <button className="btn-manage" onClick={(e) => { e.stopPropagation(); onManage(unit); }}>Manage</button>
      </div>
    </div>
  );
}
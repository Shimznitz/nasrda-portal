/* src/app/staff/units/page.tsx */
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import CreateUnitModal from '@/components/CreateUnitModal';
import './manage-units.css';

interface Unit {
  id: string;
  name: string;
  division_id: string | null;
  department_id: string | null;
  head_id: string | null;
  description?: string;
  unit_head?: {
    id: string;
    name: string;
    designation: string;
  } | null;
  unit_members?: any[];
}

export default function ManageUnits() {
  const router = useRouter();
  const params = useParams();
  const divisionId = params.id as string;
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);

  const fetchUnits = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('units')
      .select(`
        id,
        name,
        division_id,
        department_id,
        head_id,
        description,
        unit_head:profiles!units_head_id_fkey (id, name, designation),
        unit_members:profiles!profiles_unit_id_fkey (id, name)
      `)
      .order('name', { ascending: true });

    if (error) {
      console.error('UNITS FETCH ERROR:', JSON.stringify(error, null, 2));
      setUnits([]);
    } else {
      setUnits(data || [] as Unit[]);   // Safe fallback
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUnits();
  }, []);

  // ==================== NEW FUNCTIONS ADDED ====================
  const openCreateModal = () => {
    setEditingUnit(null);           // ← CLEAR editing mode for new creation
    setIsModalOpen(true);
  };

  const openEditModal = (unit: any) => {
    setEditingUnit(unit);           // ← SET the unit for editing
    setIsModalOpen(true);
  };

  return (
    <div className="manage-units-page">

      <div className="page-header">
        <div>
          <h1>Manage Operational Units</h1>
          <p>Create and manage organisational units.</p>
        </div>

        <button
          className="btn-primary"
          onClick={openCreateModal}
        >
          + Create Unit
        </button>
      </div>

      {loading ? (
        <div className="empty-state">Loading units...</div>
      ) : units.length === 0 ? (
        <div className="empty-state">
          No units have been created yet.
        </div>
      ) : (
        <div className="unit-list">
          {units.map((unit) => (
            <div 
              key={unit.id} 
              className="unit-card" 
              onClick={() => router.push(`/staff/units/${unit.id}`)}
            >
              <div className="unit-card-header">
                <h3>{unit.name}</h3>
                {unit.unit_head?.name ? (
                  <span className="head-badge">Head: {unit.unit_head.name}</span>
                ) : unit.head_id ? (
                  <span className="head-badge">Head Assigned</span>
                ) : (
                  <span className="head-badge vacant">No Head Assigned</span>
                )}
              </div>

              <div className="unit-meta">
                <div className="meta-row">
                  <span className="meta-label">Total Staff</span>
                  <span className="meta-value">
                    {unit.unit_members?.length || 0} Members
                  </span>
                </div>
              </div>

              <button 
                className="btn-manage" 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setEditingUnit(unit); 
                  openEditModal(unit);
                }}
              >
                Manage Unit
              </button>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <CreateUnitModal
          divisionId={divisionId}
          unitToEdit={editingUnit} 
          onClose={() => { 
            setIsModalOpen(false); 
            setEditingUnit(null); 
          }}
          onSuccess={() => { 
            setIsModalOpen(false); 
            setEditingUnit(null); 
            fetchUnits(); 
          }}
        />
      )}
    </div>
  );
}
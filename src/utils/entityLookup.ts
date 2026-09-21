import { Technician, Equipment, Location, EquipmentType } from '../types';

export function isDummyOrRemovedTechnician(name?: string | null): boolean {
  if (!name || typeof name !== 'string') return true;
  return /daffa\s*evan|supervisor\s*utama/i.test(name.trim());
}

/**
 * Resolves an array of technician names given technician IDs and the technician master list.
 * Preserves the order of input IDs and filters out unfound/empty names, as well as dummy names.
 */
export function resolveTechnicianNames(
  technicianIds: (number | string)[],
  technicians: Technician[]
): string[] {
  return technicianIds
    .map((id) => technicians.find((t) => Number(t.id) === Number(id))?.name)
    .filter((name): name is string => Boolean(name && name.trim() && !isDummyOrRemovedTechnician(name)));
}

/**
 * Finds an equipment item by its numerical or string ID.
 */
export function findEquipmentById(
  equipments: Equipment[],
  equipmentId?: number | string | null
): Equipment | undefined {
  if (equipmentId === undefined || equipmentId === null) return undefined;
  const numId = Number(equipmentId);
  return equipments.find((e) => Number(e.id) === numId);
}

/**
 * Finds a location item by its numerical or string ID.
 */
export function findLocationById(
  locations: Location[],
  locationId?: number | string | null
): Location | undefined {
  if (locationId === undefined || locationId === null) return undefined;
  const numId = Number(locationId);
  return locations.find((l) => Number(l.id) === numId);
}

/**
 * Finds an equipment type item by its numerical or string ID.
 */
export function findEquipmentTypeById(
  equipmentTypes: EquipmentType[],
  typeId?: number | string | null
): EquipmentType | undefined {
  if (typeId === undefined || typeId === null) return undefined;
  const numId = Number(typeId);
  return equipmentTypes.find((t) => Number(t.id) === numId);
}

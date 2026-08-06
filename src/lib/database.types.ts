/**
 * Database types — เขียนมือให้ตรงกับ supabase/schema.sql
 * ถ้าแก้ schema ให้ regenerate ด้วย:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 */

export type UserRole = 'super_admin' | 'admin' | 'technician'
export type TireStatus = 'in_stock' | 'mounted' | 'scrapped' | 'retreading'
export type TireEventType = 'mount' | 'unmount'

export type Company = {
  id: string
  code: string
  name: string
  tax_id: string | null
  phone: string | null
  email: string | null
  address: string | null
  contact_name: string | null
  logo_url: string | null
  alert_km: number
  alert_tread_mm: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type Profile = {
  id: string
  company_id: string | null
  role: UserRole
  full_name: string
  phone: string | null
  employee_no: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type RemovalReason = {
  id: string
  code: string
  name: string
  is_scrap: boolean
  sort_order: number
  is_active: boolean
  created_at: string
}

export type TireBrand = {
  id: string
  name: string
  created_by_company: string | null
  is_active: boolean
  created_at: string
}

export type TireModel = {
  id: string
  brand_id: string
  name: string
  size: string | null
  pattern_code: string | null
  /** รูปยาง (public URL จาก Supabase Storage) */
  image_url: string | null
  created_by_company: string | null
  is_active: boolean
  created_at: string
}

export type CompanyTireModel = {
  company_id: string
  tire_model_id: string
  created_at: string
}

export type Vehicle = {
  id: string
  company_id: string
  plate_no: string
  province: string
  brand: string | null
  model: string | null
  axle_type: string
  current_mileage: number
  note: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type Tire = {
  id: string
  company_id: string
  serial_no: string
  tire_model_id: string | null
  brand_name: string | null
  model_name: string | null
  size: string | null
  dot: string | null
  status: TireStatus
  vehicle_id: string | null
  position_code: string | null
  total_distance_km: number
  mounted_odometer: number | null
  mounted_at: string | null
  tread_mm: number | null
  new_tread_mm: number | null
  purchase_price: number | null
  note: string | null
  created_at: string
  updated_at: string
}

export type TireEvent = {
  id: string
  company_id: string
  tire_id: string
  vehicle_id: string | null
  event_type: TireEventType
  position_code: string | null
  odometer: number
  tread_mm: number | null
  distance_km: number | null
  reason_id: string | null
  note: string | null
  event_date: string
  created_by: string | null
  created_at: string
}

/** view: public.tire_overview */
export type TireOverview = {
  id: string
  company_id: string
  serial_no: string
  brand_name: string | null
  model_name: string | null
  size: string | null
  dot: string | null
  status: TireStatus
  tread_mm: number | null
  new_tread_mm: number | null
  total_distance_km: number
  mounted_odometer: number | null
  mounted_at: string | null
  position_code: string | null
  vehicle_id: string | null
  plate_no: string | null
  province: string | null
  current_mileage: number | null
  current_run_km: number
  lifetime_km: number
  alert_km: number
  alert_tread_mm: number
  /** รูปยางจากรุ่นที่ผูกอยู่ (ถ้ามี) */
  image_url: string | null
}

type Insert<T, Optional extends keyof T> = Omit<T, Optional> & Partial<Pick<T, Optional>>
type Timestamps = 'id' | 'created_at' | 'updated_at'

/** ประกาศ foreign key ให้ postgrest-js เข้าใจการ join (embed) */
type FK<Column extends string, Ref extends string> = {
  foreignKeyName: string
  columns: [Column]
  isOneToOne: false
  referencedRelation: Ref
  referencedColumns: ['id']
}

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: Company
        Insert: Insert<Company, Timestamps | 'tax_id' | 'phone' | 'email' | 'address'
          | 'contact_name' | 'logo_url' | 'alert_km' | 'alert_tread_mm' | 'is_active'>
        Update: Partial<Company>
        Relationships: []
      }
      profiles: {
        Row: Profile
        Insert: Insert<Profile, 'created_at' | 'updated_at' | 'phone' | 'employee_no' | 'is_active'>
        Update: Partial<Profile>
        Relationships: [FK<'company_id', 'companies'>]
      }
      removal_reasons: {
        Row: RemovalReason
        Insert: Insert<RemovalReason, 'id' | 'created_at' | 'is_scrap' | 'sort_order' | 'is_active'>
        Update: Partial<RemovalReason>
        Relationships: []
      }
      tire_brands: {
        Row: TireBrand
        Insert: Insert<TireBrand, 'id' | 'created_at' | 'created_by_company' | 'is_active'>
        Update: Partial<TireBrand>
        Relationships: [FK<'created_by_company', 'companies'>]
      }
      tire_models: {
        Row: TireModel
        Insert: Insert<TireModel, 'id' | 'created_at' | 'size' | 'pattern_code' | 'image_url'
          | 'created_by_company' | 'is_active'>
        Update: Partial<TireModel>
        Relationships: [FK<'brand_id', 'tire_brands'>, FK<'created_by_company', 'companies'>]
      }
      company_tire_models: {
        Row: CompanyTireModel
        Insert: Insert<CompanyTireModel, 'created_at'>
        Update: Partial<CompanyTireModel>
        Relationships: [FK<'company_id', 'companies'>, FK<'tire_model_id', 'tire_models'>]
      }
      vehicles: {
        Row: Vehicle
        Insert: Insert<Vehicle, Timestamps | 'brand' | 'model' | 'axle_type'
          | 'current_mileage' | 'note' | 'is_active'>
        Update: Partial<Vehicle>
        Relationships: [FK<'company_id', 'companies'>]
      }
      tires: {
        Row: Tire
        Insert: Insert<Tire, Timestamps | 'tire_model_id' | 'brand_name' | 'model_name'
          | 'size' | 'dot' | 'status' | 'vehicle_id' | 'position_code' | 'total_distance_km'
          | 'mounted_odometer' | 'mounted_at' | 'tread_mm' | 'new_tread_mm'
          | 'purchase_price' | 'note'>
        Update: Partial<Tire>
        Relationships: [
          FK<'company_id', 'companies'>,
          FK<'tire_model_id', 'tire_models'>,
          FK<'vehicle_id', 'vehicles'>,
        ]
      }
      tire_events: {
        Row: TireEvent
        Insert: Insert<TireEvent, 'id' | 'created_at' | 'vehicle_id' | 'position_code'
          | 'tread_mm' | 'distance_km' | 'reason_id' | 'note' | 'event_date' | 'created_by'>
        Update: Partial<TireEvent>
        Relationships: [
          FK<'company_id', 'companies'>,
          FK<'tire_id', 'tires'>,
          FK<'vehicle_id', 'vehicles'>,
          FK<'reason_id', 'removal_reasons'>,
          FK<'created_by', 'profiles'>,
        ]
      }
    }
    Views: {
      tire_overview: { Row: TireOverview; Relationships: [] }
    }
    Functions: {
      mount_tire: {
        Args: {
          p_tire_id: string
          p_vehicle_id: string
          p_position_code: string
          p_odometer: number
          p_tread_mm?: number | null
          p_note?: string | null
          p_event_date?: string
        }
        Returns: string
      }
      apply_tire_ops: {
        Args: {
          p_vehicle_id: string
          p_event_date: string
          p_ops: unknown
        }
        Returns: number
      }
      unmount_tire: {
        Args: {
          p_tire_id: string
          p_odometer: number
          p_tread_mm?: number | null
          p_reason_id?: string | null
          p_note?: string | null
          p_event_date?: string
        }
        Returns: string
      }
    }
    Enums: {
      user_role: UserRole
      tire_status: TireStatus
      tire_event_type: TireEventType
    }
    CompositeTypes: Record<string, never>
  }
}

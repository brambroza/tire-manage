/**
 * Database types — เขียนมือให้ตรงกับ supabase/schema.sql
 * ถ้าแก้ schema ให้ regenerate ด้วย:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 */

export type UserRole = 'super_admin' | 'admin' | 'technician'
export type TireStatus = 'in_stock' | 'mounted' | 'scrapped' | 'retreading'
export type TireEventType = 'mount' | 'unmount'
export type AxleKind = 'single' | 'dual'

/** หมวดของประเภทเพลาที่ช่างเลือกหน้างาน */
export type AxleCategory = 'head' | 'trailer'

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
  /** รถ "เปลี่ยนยางบ่อย" = ถอดยางตั้งแต่เท่านี้ครั้ง ภายใน alert_change_days วัน */
  alert_change_count: number
  alert_change_days: number
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
  /** ความลึกดอกยางเมื่อใหม่ ใช้เป็นค่าเริ่มต้นตอนเพิ่มยางรุ่นนี้ */
  new_tread_mm: number | null
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

export type AxleType = {
  id: string
  code: string
  name: string
  /** รูปแบบแต่ละเพลา เรียงจากหน้าไปหลัง */
  axle_kinds: AxleKind[]
  /** หมวดของประเภทเพลา — head = รถหัวลาก/รถบรรทุก, trailer = หางพ่วง */
  category: AxleCategory
  /** รูปผังล้อที่ช่างใช้อ้างอิงตอนเลือกตำแหน่งล้อ */
  image_url: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CompanyAxleType = {
  company_id: string
  axle_type_id: string
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

/** view: public.vehicle_change_alerts — รถที่ถอดยางถึงเกณฑ์ "เปลี่ยนบ่อย" */
export type VehicleChangeAlert = {
  vehicle_id: string
  company_id: string
  plate_no: string
  province: string
  axle_type: string
  is_active: boolean
  /** เกณฑ์จำนวนครั้ง (companies.alert_change_count) */
  threshold: number
  /** ช่วงวันที่นับย้อนหลัง (companies.alert_change_days) */
  window_days: number
  change_count: number
  last_event_date: string
}

type Insert<T, Optional extends keyof T> = Omit<T, Optional> & Partial<Pick<T, Optional>>
type Timestamps = 'id' | 'created_at' | 'updated_at'

/** ประกาศ foreign key ให้ postgrest-js เข้าใจการ join (embed) */
type FK<Column extends string, Ref extends string, RefColumn extends string = 'id'> = {
  foreignKeyName: string
  columns: [Column]
  isOneToOne: false
  referencedRelation: Ref
  referencedColumns: [RefColumn]
}

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: Company
        Insert: Insert<Company, Timestamps | 'code' | 'tax_id' | 'phone' | 'email' | 'address'
          | 'contact_name' | 'logo_url' | 'alert_km' | 'alert_tread_mm'
          | 'alert_change_count' | 'alert_change_days' | 'is_active'>
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
        Insert: Insert<TireModel, 'id' | 'created_at' | 'size' | 'pattern_code' | 'new_tread_mm' | 'image_url'
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
      axle_types: {
        Row: AxleType
        Insert: Insert<AxleType, Timestamps | 'sort_order' | 'is_active' | 'category' | 'image_url'>
        Update: Partial<AxleType>
        Relationships: []
      }
      company_axle_types: {
        Row: CompanyAxleType
        Insert: Insert<CompanyAxleType, 'created_at'>
        Update: Partial<CompanyAxleType>
        Relationships: [FK<'company_id', 'companies'>, FK<'axle_type_id', 'axle_types'>]
      }
      vehicles: {
        Row: Vehicle
        Insert: Insert<Vehicle, Timestamps | 'brand' | 'model'
          | 'current_mileage' | 'note' | 'is_active'>
        Update: Partial<Vehicle>
        Relationships: [FK<'company_id', 'companies'>, FK<'axle_type', 'axle_types', 'code'>]
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
      vehicle_change_alerts: { Row: VehicleChangeAlert; Relationships: [] }
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

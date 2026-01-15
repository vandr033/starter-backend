export type CreateCompanyModel = {
    name: String,
    address: String,
    phone_prefix: String,
    phone: String,
    email: String,
    google_maps_url?: String,
    timezone: String,
    company_type_id:number,
    city?: String,
    state?: String,
    country_code?:String,
}
  
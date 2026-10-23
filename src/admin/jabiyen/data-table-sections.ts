export type JabiyenContentSectionSpec = {
  name: string;
  title: string;
  description: string;
  group: string;
  path: string;
  editableColumns: string[];
};

/**
 * All public tables are listed for authorized administrators. Only website
 * content and store configuration has generic write access; customer, admin,
 * checkout and order data is read-only here and protected from generic writes.
 */
export const JABIYEN_CONTENT_SECTION_SPECS: JabiyenContentSectionSpec[] = [
  {
    name: "about_us", title: "About Us", description: "Manage the About Us page content.", group: "Website pages", path: "/about",
    editableColumns: ["header_title", "header_subtitle", "header_image", "section_title", "section_subtitle", "section_image", "section_description", "cta_text", "cta_link", "sort_order", "is_active"],
  },
  {
    name: "blog", title: "Blog", description: "Manage the store blog page content.", group: "Website pages", path: "/blog",
    editableColumns: ["header_title", "header_subtitle", "header_image", "section_title", "section_subtitle", "section_image", "section_description", "cta_text", "cta_link", "sort_order", "is_active"],
  },
  {
    name: "cookie_policy", title: "Cookie Policy", description: "Manage the cookie policy page.", group: "Website pages", path: "/cookie-policy",
    editableColumns: ["header_title", "header_subtitle", "header_image", "section_title", "section_subtitle", "section_image", "section_description", "cta_text", "cta_link", "sort_order", "is_active"],
  },
  {
    name: "faq", title: "FAQ", description: "Manage the FAQ page content.", group: "Website pages", path: "/faq",
    editableColumns: ["header_title", "header_subtitle", "header_image", "section_title", "section_subtitle", "section_image", "section_description", "cta_text", "cta_link", "sort_order", "is_active"],
  },
  {
    name: "privacy_policy", title: "Privacy Policy", description: "Manage the privacy policy page.", group: "Website pages", path: "/privacy-policy",
    editableColumns: ["header_title", "header_subtitle", "header_image", "section_title", "section_subtitle", "section_image", "section_description", "cta_text", "cta_link", "sort_order", "is_active"],
  },
  {
    name: "refund_policy", title: "Refund Policy", description: "Manage the refund policy page.", group: "Website pages", path: "/refund-policy",
    editableColumns: ["header_title", "header_subtitle", "header_image", "section_title", "section_subtitle", "section_image", "section_description", "cta_text", "cta_link", "sort_order", "is_active"],
  },
  {
    name: "return_policy", title: "Return Policy", description: "Manage the return policy page.", group: "Website pages", path: "/return-policy",
    editableColumns: ["header_title", "header_subtitle", "header_image", "section_title", "section_subtitle", "section_image", "section_description", "cta_text", "cta_link", "sort_order", "is_active"],
  },
  {
    name: "shipping_policy", title: "Shipping Policy", description: "Manage the shipping policy page.", group: "Website pages", path: "/shipping-policy",
    editableColumns: ["header_title", "header_subtitle", "header_image", "section_title", "section_subtitle", "section_image", "section_description", "cta_text", "cta_link", "sort_order", "is_active"],
  },
  {
    name: "store_locator", title: "Store Locator", description: "Manage store locator page content.", group: "Website pages", path: "/store-locator",
    editableColumns: ["header_title", "header_subtitle", "header_image", "section_title", "section_subtitle", "section_image", "section_description", "cta_text", "cta_link", "sort_order", "is_active"],
  },
  {
    name: "story", title: "Our Story", description: "Manage the Our Story page content.", group: "Website pages", path: "/story",
    editableColumns: ["header_title", "header_subtitle", "header_image", "section_title", "section_subtitle", "section_image", "section_description", "cta_text", "cta_link", "sort_order", "is_active"],
  },
  {
    name: "terms_conditions", title: "Terms & Conditions", description: "Manage the terms and conditions page.", group: "Website pages", path: "/terms-and-conditions",
    editableColumns: ["header_title", "header_subtitle", "header_image", "section_title", "section_subtitle", "section_image", "section_description", "cta_text", "cta_link", "sort_order", "is_active"],
  },
  {
    name: "announcement_bar", title: "Announcement Bar", description: "Manage the announcement text, colors and display dates.", group: "Homepage", path: "/announcement-bar",
    editableColumns: ["message", "link_url", "link_title", "bg_color", "text_color", "is_active", "start_date", "end_date"],
  },
  {
    name: "hero_secondary", title: "Secondary Hero Banners", description: "Manage secondary homepage hero banners.", group: "Homepage", path: "/hero-secondary",
    editableColumns: ["title", "subtitle", "img", "cta_text", "cta_link", "is_active", "sort_order"],
  },
  {
    name: "home_showcase_header", title: "Home Showcase Header", description: "Manage the homepage showcase heading and subtitle.", group: "Homepage", path: "/home-showcase",
    editableColumns: ["title", "subtitle", "is_active"],
  },
  {
    name: "home_showcase_items", title: "Home Showcase Items", description: "Choose and order categories shown in the homepage showcase.", group: "Homepage", path: "/home-showcase-items",
    editableColumns: ["gender", "category_id", "sort_order", "is_active"],
  },
  {
    name: "footer_content", title: "Footer Content", description: "Manage contact information and the main footer text.", group: "Footer", path: "/footer/content",
    editableColumns: ["section_name", "title", "description", "logo_url", "email", "phone", "address", "working_hours", "copyright_text", "is_active"],
  },
  {
    name: "footer_menus", title: "Footer Menus", description: "Manage footer menu headings.", group: "Footer", path: "/footer/menus",
    editableColumns: ["title", "sort_order", "is_active"],
  },
  {
    name: "footer_quick_links", title: "Footer Quick Links", description: "Manage footer links and their display order.", group: "Footer", path: "/footer/quick-links",
    editableColumns: ["menu_id", "title", "link_url", "icon_class", "description", "open_in_new_tab", "parent_id", "sort_order", "is_active"],
  },
  {
    name: "footer_social_links", title: "Footer Social Links", description: "Manage social platforms and profile links.", group: "Footer", path: "/footer/social-links",
    editableColumns: ["platform_name", "platform_icon", "link_url", "hover_title", "sort_order", "is_active"],
  },
  {
    name: "footer_payment_methods", title: "Footer Payment Methods", description: "Manage the payment methods shown in the footer.", group: "Footer", path: "/footer/payment-methods",
    editableColumns: ["name", "icon_url", "account_number", "qr_code_url", "sort_order", "is_active"],
  },
  {
    name: "footer_shipping_partners", title: "Footer Shipping Partners", description: "Manage the delivery partners shown in the footer.", group: "Footer", path: "/footer/shipping-partners",
    editableColumns: ["name", "icon_url", "sort_order", "is_active"],
  },
  {
    name: "footer_certifications", title: "Footer Certifications", description: "Manage footer certifications and badges.", group: "Footer", path: "/footer/certifications",
    editableColumns: ["name", "badge_url", "link_url", "sort_order", "is_active"],
  },
  {
    name: "footer_app_links", title: "Footer App Links", description: "Manage App Store and Play Store links.", group: "Footer", path: "/footer/app-links",
    editableColumns: ["platform_name", "app_store_url", "play_store_url", "icon_url", "sort_order", "is_active"],
  },
  {
    name: "footer_country_selector", title: "Footer Country Selector", description: "Manage the country, language and currency options.", group: "Footer", path: "/footer/countries",
    editableColumns: ["country_name", "country_code", "language_name", "language_code", "flag_url", "currency_code", "currency_symbol", "exchange_rate", "is_rtl", "is_default", "sort_order", "is_active"],
  },
  {
    name: "footer_trust_badges", title: "Footer Trust Badges", description: "Manage trust badges and captions.", group: "Footer", path: "/footer/trust-badges",
    editableColumns: ["title", "subtitle", "badge_url", "sort_order", "is_active"],
  },
  {
    name: "footer_settings", title: "Footer Settings", description: "Manage footer layout, colors and display options.", group: "Footer", path: "/footer/settings",
    editableColumns: ["layout_style", "theme", "copyright_text", "version", "background_color", "text_color", "show_social_links", "show_payment_methods", "show_app_links", "show_country_selector", "custom_css", "is_active"],
  },
  {
    name: "shipping_fees", title: "Shipping Fees", description: "Manage delivery rates in BDT by country, state, city and delivery type.", group: "Store settings", path: "/shipping-fees",
    editableColumns: ["country_code", "country_name", "state", "city", "postal_code", "delivery_type", "delivery_fee", "free_shipping_minimum", "estimated_days_min", "estimated_days_max", "is_active"],
  },
  {
    name: "currency_rates", title: "Currency Rates", description: "Manage supported currencies and exchange rates.", group: "Store settings", path: "/currency-rates",
    editableColumns: ["currency_code", "currency_name", "currency_symbol", "exchange_rate", "is_active", "is_default"],
  },
  {
    name: "admins", title: "Administrator Accounts", description: "Read-only administrator account records.", group: "Administration", path: "/admin/database/admins",
    editableColumns: [],
  },
  {
    name: "categories", title: "Categories", description: "Read-only category records.", group: "Catalog", path: "/admin/database/categories",
    editableColumns: [],
  },
  {
    name: "subcategories", title: "Subcategories", description: "Read-only subcategory records.", group: "Catalog", path: "/admin/database/subcategories",
    editableColumns: [],
  },
  {
    name: "menu_items", title: "Menu Items", description: "Read-only navigation menu records.", group: "Catalog", path: "/admin/database/menu_items",
    editableColumns: [],
  },
  {
    name: "products", title: "Products", description: "Read-only product records.", group: "Catalog", path: "/admin/database/products",
    editableColumns: [],
  },
  {
    name: "product_videos", title: "Product Videos", description: "Read-only product video records.", group: "Catalog", path: "/admin/database/product_videos",
    editableColumns: [],
  },
  {
    name: "product_banners", title: "Product Banners", description: "Read-only product banner records.", group: "Catalog", path: "/admin/database/product_banners",
    editableColumns: [],
  },
  {
    name: "hero", title: "Hero Banners", description: "Read-only primary hero banner records.", group: "Catalog", path: "/admin/database/hero",
    editableColumns: [],
  },
  {
    name: "hero_videos", title: "Hero Videos", description: "Read-only hero video records.", group: "Catalog", path: "/admin/database/hero_videos",
    editableColumns: [],
  },
  {
    name: "product_colors", title: "Product Colors", description: "Read-only product color records.", group: "Catalog", path: "/admin/database/product_colors",
    editableColumns: [],
  },
  {
    name: "color_sizes", title: "Color Sizes", description: "Read-only color and size records.", group: "Catalog", path: "/admin/database/color_sizes",
    editableColumns: [],
  },
  {
    name: "product_variants", title: "Product Variants", description: "Read-only product variant records.", group: "Catalog", path: "/admin/database/product_variants",
    editableColumns: [],
  },
  {
    name: "profiles", title: "Customer Profiles", description: "Read-only customer profile records.", group: "Customer data", path: "/admin/database/profiles",
    editableColumns: [],
  },
  {
    name: "customer_profiles", title: "Central Customer Profiles", description: "Read-only synchronized customer records.", group: "Customer data", path: "/admin/database/customer_profiles",
    editableColumns: [],
  },
  {
    name: "checkout_sessions", title: "Checkout Sessions", description: "Read-only checkout records.", group: "Orders & checkout", path: "/admin/database/checkout_sessions",
    editableColumns: [],
  },
  {
    name: "orders", title: "Orders", description: "Read-only order records.", group: "Orders & checkout", path: "/admin/database/orders",
    editableColumns: [],
  },
  {
    name: "order_items", title: "Order Items", description: "Read-only order line-item records.", group: "Orders & checkout", path: "/admin/database/order_items",
    editableColumns: [],
  },
  {
    name: "order_payments", title: "Order Payments", description: "Read-only payment records.", group: "Orders & checkout", path: "/admin/database/order_payments",
    editableColumns: [],
  },
  {
    name: "order_status_history", title: "Order Status History", description: "Read-only order status audit history.", group: "Orders & checkout", path: "/admin/database/order_status_history",
    editableColumns: [],
  },
];

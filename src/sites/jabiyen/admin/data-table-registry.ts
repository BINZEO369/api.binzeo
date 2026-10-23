// Schema snapshot from the JABIYEN public database; update when schema tables/columns change.
export const JABIYEN_ADMIN_TABLES = [
  {
    "name": "admins",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "user_id",
        "type": "uuid",
        "nullable": true,
        "default": null
      },
      {
        "name": "email",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "full_name",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "phone",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "role",
        "type": "text",
        "nullable": true,
        "default": "'admin'::text"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "added_by",
        "type": "uuid",
        "nullable": true,
        "default": null
      },
      {
        "name": "notes",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "last_login",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "store_locator",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_title",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "header_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_text",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "cookie_policy",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_title",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "header_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_text",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "refund_policy",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_title",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "header_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_text",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "terms_conditions",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_title",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "header_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_text",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "privacy_policy",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_title",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "header_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_text",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "blog",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_title",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "header_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_text",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "return_policy",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_title",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "header_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_text",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "shipping_policy",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_title",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "header_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_text",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "faq",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_title",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "header_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_text",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "about_us",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_title",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "header_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_text",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "footer_social_links",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "platform_name",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "platform_icon",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "link_url",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "hover_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "footer_menus",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "title",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "footer_quick_links",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "menu_id",
        "type": "bigint",
        "nullable": true,
        "default": null
      },
      {
        "name": "title",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "link_url",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "icon_class",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "open_in_new_tab",
        "type": "boolean",
        "nullable": true,
        "default": "false"
      },
      {
        "name": "parent_id",
        "type": "bigint",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "footer_content",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "section_name",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "logo_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "email",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "phone",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "address",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "working_hours",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "copyright_text",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "footer_payment_methods",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "name",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "icon_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "account_number",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "qr_code_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "footer_shipping_partners",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "name",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "icon_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "footer_certifications",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "name",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "badge_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "link_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "footer_app_links",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "platform_name",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "app_store_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "play_store_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "icon_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "footer_country_selector",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "country_name",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "country_code",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "language_name",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "language_code",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "flag_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "currency_code",
        "type": "text",
        "nullable": true,
        "default": "'BDT'::text"
      },
      {
        "name": "currency_symbol",
        "type": "text",
        "nullable": true,
        "default": "'৳'::text"
      },
      {
        "name": "exchange_rate",
        "type": "numeric",
        "nullable": true,
        "default": "1"
      },
      {
        "name": "is_rtl",
        "type": "boolean",
        "nullable": true,
        "default": "false"
      },
      {
        "name": "is_default",
        "type": "boolean",
        "nullable": true,
        "default": "false"
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "footer_trust_badges",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "title",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "badge_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "footer_settings",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "layout_style",
        "type": "text",
        "nullable": true,
        "default": "'standard'::text"
      },
      {
        "name": "theme",
        "type": "text",
        "nullable": true,
        "default": "'dark'::text"
      },
      {
        "name": "copyright_text",
        "type": "text",
        "nullable": true,
        "default": "'© 2025 JayenWare. All Rights Reserved.'::text"
      },
      {
        "name": "version",
        "type": "text",
        "nullable": true,
        "default": "'1.0'::text"
      },
      {
        "name": "background_color",
        "type": "text",
        "nullable": true,
        "default": "'#1a1a1a'::text"
      },
      {
        "name": "text_color",
        "type": "text",
        "nullable": true,
        "default": "'#ffffff'::text"
      },
      {
        "name": "show_social_links",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "show_payment_methods",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "show_app_links",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "show_country_selector",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "custom_css",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "announcement_bar",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "message",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "link_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "link_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "bg_color",
        "type": "text",
        "nullable": true,
        "default": "'#000000'::text"
      },
      {
        "name": "text_color",
        "type": "text",
        "nullable": true,
        "default": "'#FFFFFF'::text"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "start_date",
        "type": "timestamp with time zone",
        "nullable": false,
        "default": null
      },
      {
        "name": "end_date",
        "type": "timestamp with time zone",
        "nullable": false,
        "default": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "story",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_title",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "header_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "header_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "section_description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_text",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "categories",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "name",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "slug",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "image_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "video_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "image_cta_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "image_cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "video_cta_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "video_cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "meta_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "meta_description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "video_schema",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "keywords",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "subcategories",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "category_id",
        "type": "bigint",
        "nullable": true,
        "default": null
      },
      {
        "name": "name",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "slug",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "image_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "video_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "image_cta_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "image_cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "video_cta_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "video_cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "meta_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "meta_description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "video_schema",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "keywords",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "menu_items",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "title",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "link",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "image_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "image_cta_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "image_cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "icon_class",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "badge_text",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "badge_color",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "parent_id",
        "type": "bigint",
        "nullable": true,
        "default": null
      },
      {
        "name": "category_id",
        "type": "bigint",
        "nullable": true,
        "default": null
      },
      {
        "name": "subcategory_id",
        "type": "bigint",
        "nullable": true,
        "default": null
      },
      {
        "name": "menu_type",
        "type": "text",
        "nullable": true,
        "default": "'link'::text"
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "products",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "title",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "slug",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sku",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "category_id",
        "type": "bigint",
        "nullable": true,
        "default": null
      },
      {
        "name": "category_code",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "subcategory_id",
        "type": "bigint",
        "nullable": true,
        "default": null
      },
      {
        "name": "description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "short_description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "fabric_type",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "gsm_type",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "fit_type",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "gender",
        "type": "text",
        "nullable": true,
        "default": "'Unisex'::text"
      },
      {
        "name": "tags",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "search_tags",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "print_type",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "img",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "images",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "price",
        "type": "numeric",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "old_price",
        "type": "numeric",
        "nullable": true,
        "default": null
      },
      {
        "name": "is_best",
        "type": "boolean",
        "nullable": true,
        "default": "false"
      },
      {
        "name": "is_hot",
        "type": "boolean",
        "nullable": true,
        "default": "false"
      },
      {
        "name": "is_new_arrival",
        "type": "boolean",
        "nullable": true,
        "default": "false"
      },
      {
        "name": "is_out_of_stock",
        "type": "boolean",
        "nullable": true,
        "default": "false"
      },
      {
        "name": "is_limited_edition",
        "type": "boolean",
        "nullable": true,
        "default": "false"
      },
      {
        "name": "is_featured",
        "type": "boolean",
        "nullable": true,
        "default": "false"
      },
      {
        "name": "is_on_sale",
        "type": "boolean",
        "nullable": true,
        "default": "false"
      },
      {
        "name": "barcode",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "seo_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "google_seo",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "seo_description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "seo_keywords",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "product_videos",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "product_id",
        "type": "bigint",
        "nullable": true,
        "default": null
      },
      {
        "name": "title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "video_url",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "thumbnail_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "click_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "product_banners",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "product_id",
        "type": "bigint",
        "nullable": true,
        "default": null
      },
      {
        "name": "title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "banner_url",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "click_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "hero_secondary",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "img",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_text",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "hero",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "img",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_text",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "hero_videos",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "video_url",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "cta_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "cta_link",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "meta_title",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "meta_description",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "video_schema",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "keywords",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "product_colors",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "product_id",
        "type": "bigint",
        "nullable": true,
        "default": null
      },
      {
        "name": "color_name",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "color_code",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "color_image",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "color_stock",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "color_sizes",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "color_id",
        "type": "bigint",
        "nullable": true,
        "default": null
      },
      {
        "name": "size_name",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "product_variants",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "product_id",
        "type": "bigint",
        "nullable": true,
        "default": null
      },
      {
        "name": "color_id",
        "type": "bigint",
        "nullable": true,
        "default": null
      },
      {
        "name": "size_id",
        "type": "bigint",
        "nullable": true,
        "default": null
      },
      {
        "name": "sku",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "barcode",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "name",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "material",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "weight",
        "type": "numeric",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "price",
        "type": "numeric",
        "nullable": false,
        "default": null
      },
      {
        "name": "old_price",
        "type": "numeric",
        "nullable": true,
        "default": null
      },
      {
        "name": "stock",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "home_showcase_header",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "title",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "subtitle",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "home_showcase_items",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "gender",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "category_id",
        "type": "bigint",
        "nullable": true,
        "default": null
      },
      {
        "name": "sort_order",
        "type": "integer",
        "nullable": true,
        "default": "0"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": true,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "profiles",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "nullable": false,
        "default": null
      },
      {
        "name": "email",
        "type": "text",
        "nullable": false,
        "default": "''::text"
      },
      {
        "name": "provider",
        "type": "text",
        "nullable": false,
        "default": "'email'::text"
      },
      {
        "name": "first_name",
        "type": "text",
        "nullable": false,
        "default": "''::text"
      },
      {
        "name": "last_name",
        "type": "text",
        "nullable": false,
        "default": "''::text"
      },
      {
        "name": "phone",
        "type": "text",
        "nullable": false,
        "default": "''::text"
      },
      {
        "name": "address_line1",
        "type": "text",
        "nullable": false,
        "default": "''::text"
      },
      {
        "name": "address_line2",
        "type": "text",
        "nullable": false,
        "default": "''::text"
      },
      {
        "name": "city",
        "type": "text",
        "nullable": false,
        "default": "''::text"
      },
      {
        "name": "state",
        "type": "text",
        "nullable": false,
        "default": "''::text"
      },
      {
        "name": "postal_code",
        "type": "text",
        "nullable": false,
        "default": "''::text"
      },
      {
        "name": "country",
        "type": "text",
        "nullable": false,
        "default": "''::text"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "customer_profiles",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "central_user_id",
        "type": "uuid",
        "nullable": false,
        "default": null
      },
      {
        "name": "email",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "first_name",
        "type": "text",
        "nullable": false,
        "default": "''::text"
      },
      {
        "name": "last_name",
        "type": "text",
        "nullable": false,
        "default": "''::text"
      },
      {
        "name": "display_name",
        "type": "text",
        "nullable": false,
        "default": "''::text"
      },
      {
        "name": "username",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "date_of_birth",
        "type": "date",
        "nullable": true,
        "default": null
      },
      {
        "name": "country_code",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "account_status",
        "type": "text",
        "nullable": false,
        "default": "'active'::text"
      },
      {
        "name": "last_synced_at",
        "type": "timestamp with time zone",
        "nullable": false,
        "default": "now()"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": false,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": false,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "checkout_sessions",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "nullable": false,
        "default": "gen_random_uuid()"
      },
      {
        "name": "idempotency_key",
        "type": "uuid",
        "nullable": false,
        "default": null
      },
      {
        "name": "customer_name",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "customer_phone",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "customer_email",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "shipping_address",
        "type": "jsonb",
        "nullable": false,
        "default": null
      },
      {
        "name": "delivery_notes",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "currency",
        "type": "text",
        "nullable": false,
        "default": "'BDT'::text"
      },
      {
        "name": "subtotal",
        "type": "numeric",
        "nullable": false,
        "default": null
      },
      {
        "name": "delivery_fee",
        "type": "numeric",
        "nullable": true,
        "default": null
      },
      {
        "name": "total_amount",
        "type": "numeric",
        "nullable": true,
        "default": null
      },
      {
        "name": "delivery_fee_status",
        "type": "text",
        "nullable": false,
        "default": "'to_be_confirmed'::text"
      },
      {
        "name": "payment_method",
        "type": "text",
        "nullable": false,
        "default": "'cod'::text"
      },
      {
        "name": "status",
        "type": "text",
        "nullable": false,
        "default": "'submitted'::text"
      },
      {
        "name": "request_fingerprint",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": false,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": false,
        "default": "now()"
      },
      {
        "name": "delivery_type",
        "type": "text",
        "nullable": false,
        "default": "'Standard'::text"
      },
      {
        "name": "estimated_days_min",
        "type": "integer",
        "nullable": true,
        "default": null
      },
      {
        "name": "estimated_days_max",
        "type": "integer",
        "nullable": true,
        "default": null
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "orders",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "nullable": false,
        "default": "gen_random_uuid()"
      },
      {
        "name": "order_number",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "checkout_id",
        "type": "uuid",
        "nullable": false,
        "default": null
      },
      {
        "name": "status",
        "type": "text",
        "nullable": false,
        "default": "'pending_confirmation'::text"
      },
      {
        "name": "access_token_hash",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": false,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": false,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "order_items",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "nullable": false,
        "default": "gen_random_uuid()"
      },
      {
        "name": "order_id",
        "type": "uuid",
        "nullable": false,
        "default": null
      },
      {
        "name": "product_id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "variant_id",
        "type": "bigint",
        "nullable": true,
        "default": null
      },
      {
        "name": "product_name",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "variant_name",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "sku",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "color_name",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "size_name",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "image_url",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "quantity",
        "type": "integer",
        "nullable": false,
        "default": null
      },
      {
        "name": "unit_price",
        "type": "numeric",
        "nullable": false,
        "default": null
      },
      {
        "name": "line_total",
        "type": "numeric",
        "nullable": false,
        "default": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": false,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "order_payments",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "nullable": false,
        "default": "gen_random_uuid()"
      },
      {
        "name": "order_id",
        "type": "uuid",
        "nullable": false,
        "default": null
      },
      {
        "name": "method",
        "type": "text",
        "nullable": false,
        "default": "'cod'::text"
      },
      {
        "name": "status",
        "type": "text",
        "nullable": false,
        "default": "'awaiting_collection'::text"
      },
      {
        "name": "currency",
        "type": "text",
        "nullable": false,
        "default": "'BDT'::text"
      },
      {
        "name": "amount_due",
        "type": "numeric",
        "nullable": true,
        "default": null
      },
      {
        "name": "collected_amount",
        "type": "numeric",
        "nullable": true,
        "default": null
      },
      {
        "name": "collected_at",
        "type": "timestamp with time zone",
        "nullable": true,
        "default": null
      },
      {
        "name": "provider_reference",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": false,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": false,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "order_status_history",
    "columns": [
      {
        "name": "id",
        "type": "bigint",
        "nullable": false,
        "default": null
      },
      {
        "name": "order_id",
        "type": "uuid",
        "nullable": false,
        "default": null
      },
      {
        "name": "from_status",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "to_status",
        "type": "text",
        "nullable": false,
        "default": null
      },
      {
        "name": "changed_by",
        "type": "text",
        "nullable": false,
        "default": "'system'::text"
      },
      {
        "name": "note",
        "type": "text",
        "nullable": true,
        "default": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": false,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "shipping_fees",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "nullable": false,
        "default": "gen_random_uuid()"
      },
      {
        "name": "country_code",
        "type": "character varying",
        "nullable": false,
        "default": null
      },
      {
        "name": "country_name",
        "type": "character varying",
        "nullable": false,
        "default": null
      },
      {
        "name": "state",
        "type": "character varying",
        "nullable": false,
        "default": "'*'::character varying"
      },
      {
        "name": "city",
        "type": "character varying",
        "nullable": false,
        "default": "'*'::character varying"
      },
      {
        "name": "postal_code",
        "type": "character varying",
        "nullable": true,
        "default": null
      },
      {
        "name": "delivery_type",
        "type": "character varying",
        "nullable": false,
        "default": null
      },
      {
        "name": "delivery_fee",
        "type": "numeric",
        "nullable": false,
        "default": null
      },
      {
        "name": "free_shipping_minimum",
        "type": "numeric",
        "nullable": false,
        "default": "0"
      },
      {
        "name": "estimated_days_min",
        "type": "integer",
        "nullable": false,
        "default": null
      },
      {
        "name": "estimated_days_max",
        "type": "integer",
        "nullable": false,
        "default": null
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": false,
        "default": "true"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": false,
        "default": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": false,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  },
  {
    "name": "currency_rates",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "nullable": false,
        "default": "gen_random_uuid()"
      },
      {
        "name": "currency_code",
        "type": "character varying",
        "nullable": false,
        "default": null
      },
      {
        "name": "currency_name",
        "type": "character varying",
        "nullable": false,
        "default": null
      },
      {
        "name": "currency_symbol",
        "type": "character varying",
        "nullable": false,
        "default": null
      },
      {
        "name": "exchange_rate",
        "type": "numeric",
        "nullable": false,
        "default": null
      },
      {
        "name": "is_active",
        "type": "boolean",
        "nullable": false,
        "default": "true"
      },
      {
        "name": "is_default",
        "type": "boolean",
        "nullable": false,
        "default": "false"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "nullable": false,
        "default": "now()"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "nullable": false,
        "default": "now()"
      }
    ],
    "primaryKeys": [
      "id"
    ]
  }
] as const;

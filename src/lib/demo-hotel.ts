import type { ScrapedPayload } from "@/lib/schema/hotel";

export function buildDemoScrapedPayload(): ScrapedPayload {
  return {
    structured: {
      hotel_name: "Harbor & Pine Hotel",
      website: "https://demo.harborpine.example",
      contact: {
        phone: "(415) 555-0198",
        email: "",
        address: "120 Market Street, San Francisco, CA 94105",
        phones: [
          {
            label: "Primary phone",
            value: "(415) 555-0198",
            note: "Main phone found on the demo homepage.",
          },
          {
            label: "Reservations",
            value: "(415) 555-0144",
            note: "Separate reservations line found near booking copy.",
          },
        ],
        addresses: [
          {
            label: "Hotel address",
            value: "120 Market Street, San Francisco, CA 94105",
            note: "Street address found in contact section.",
          },
        ],
      },
      amenities: {
        pool: true,
        gym: false,
        wifi: true,
        parking: false,
        spa: false,
        breakfast: true,
        accessible_rooms: false,
        ev_charging: false,
        meeting_space: false,
      },
      dining: [
        {
          restaurant_name: "Drift Kitchen",
          hours: "",
          menu_items: ["Smoked salmon toast", "Seasonal grain bowl"],
        },
      ],
      services: ["Concierge", "Laundry"],
      policies: {
        check_in: "3:00 PM",
        check_out: "",
        pet_policy: "",
        cancellation_policy: "Flexible rates may be cancelled up to 48 hours before arrival.",
        smoking_policy: "",
      },
      room_types: ["King Room", "Two Queen Room"],
      images: [
        "https://images.unsplash.com/photo-1566073771259-6a8506099945",
        "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa",
      ],
      metadata: {
        scrape_timestamp: new Date().toISOString(),
        source_pages: [
          "https://demo.harborpine.example/",
          "https://demo.harborpine.example/rooms",
          "https://demo.harborpine.example/dining",
        ],
        image_details: [
          {
            url: "https://images.unsplash.com/photo-1566073771259-6a8506099945",
            alt: "Hotel exterior",
            caption: "Potential exterior image found on the homepage.",
            category: "Property",
          },
          {
            url: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa",
            alt: "Guest room",
            caption: "Potential guest room image found on the rooms page.",
            category: "Rooms",
          },
        ],
      },
    },
    raw_pages: [
      {
        url: "https://demo.harborpine.example/",
        text: "Harbor & Pine Hotel offers Wi-Fi, a pool, concierge service, laundry, and flexible cancellation rates.",
      },
      {
        url: "https://demo.harborpine.example/dining",
        text: "Drift Kitchen serves smoked salmon toast and seasonal grain bowls.",
      },
    ],
    fieldConfidence: {
      hotel_name: 0.88,
      "contact.phone": 0.76,
      "contact.email": 0,
      "contact.address": 0.82,
      "amenities.pool": 0.72,
      "amenities.gym": 0,
      "amenities.wifi": 0.7,
      "amenities.parking": 0.2,
      "amenities.spa": 0.1,
      dining: 0.55,
      services: 0.55,
      "policies.check_in": 0.58,
      "policies.check_out": 0,
      "policies.pet_policy": 0,
      "policies.cancellation_policy": 0.5,
      "policies.smoking_policy": 0,
      room_types: 0.5,
      images: 0.65,
    },
  };
}

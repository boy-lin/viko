export const RESOLUTION_GROUPS_DEVICES = [
  {
    id: "iphone",
    label: "iPhone",
    resolutions: [
      { value: "2556x1179", label: "15, 15 Pro" },
      { value: "2796x1290", label: "15 Pro Max" },
    ],
  },
  {
    id: "samsung",
    label: "Samsung",
    resolutions: [
      { value: "2556x1179", label: "Galaxy S24, Galaxy S24 Ultra" },
    ],
  },
  {
    id: "xiaomi",
    label: "Xiaomi",
    resolutions: [
      { value: "2556x1179", label: "Xiaomi 15, Xiaomi 15 Pro" },
      { value: "2796x1290", label: "Xiaomi 15 Pro Max" },
    ],
  },
  {
    id: "oppo",
    label: "OPPO",
    resolutions: [
      { value: "2556x1179", label: "Find X7, Find X7 Pro" },
    ],
  },
  {
    id: "vivo",
    label: "VIVO",
    resolutions: [
      { value: "2556x1179", label: "VIVO X100, VIVO X100 Pro" },
    ],
  },
  {
    id: "huawei",
    label: "Huawei",
    resolutions: [
      { value: "2556x1179", label: "Mate 60 Pro, P60 Pro" },
    ],
  }
]

export const RESOLUTION_GROUPS_PLATFORMS = [
  {
    id: "youtube",
    label: "YouTube",
    resolutions: [
      { value: "1920x1080", label: "1080p" },
    ],
  },
  {
    id: "facebook",
    label: "Facebook",
    resolutions: [
      { value: "1920x1080", label: "1080p" },
    ],
  },
  {
    id: "instagram",
    label: "Instagram",
    resolutions: [
      { value: "1920x1080", label: "1080p" },
    ],
  },
  {
    id: "douyin",
    label: "抖音",
    resolutions: [
      { value: "1080x608", label: "横版" },
      { value: "1242x1660", label: "竖版" },
    ],
  },
  {
    id: "tiktok",
    label: "TikTok",
    resolutions: [
      { value: "1080x1920", label: "横版" },
      { value: "1080x1080", label: "竖版" },
    ],
  },
  {
    id: "xiaohongshu",
    label: "小红书",
    resolutions: [
      { value: "1920x1080", label: "横版" },
      { value: "1080x1440", label: "竖版" },
    ],
  },
  {
    id: "bilibili",
    label: "Bilibili",
    resolutions: [
      { value: "1146x717", label: "默认尺寸" },
    ],
  },
  {
    id: "weixin",
    label: "微信视频号",
    resolutions: [
      { value: "1080x608", label: "横版" },
      { value: "1080×1260", label: "竖版" },
    ],
  },
]

export interface ResolutionOption {
  label: string;
  value: string;
}

export interface ResolutionGroup {
  label: string;
  options: ResolutionOption[];
}

export const RESOLUTION_OPTIONS = [
  {
    label: "",
    options: [
      { value: "auto", label: "Auto" },
    ]
  },
  {
    label: "8K / 4K / UHD",
    options: [
      { value: "7680x4320", label: "8K (7680x4320)" },
      { value: "3840x2160", label: "4K (3840x2160)" },
    ]
  },
  {
    label: "2K / QHD",
    options: [
      { value: "2560x1440", label: "2K (2560x1440)" },
      { value: "2796x1290", label: "2796x1290" },
      { value: "2556x1179", label: "2556x1179" },
    ]
  },
  {
    label: "FHD / 1080P",
    options: [
      { value: "1920x1080", label: "1080P (1920x1080)" },
      { value: "1080x1920", label: "1080x1920" },
      { value: "1080x1440", label: "1080x1440" },
      { value: "1242x1660", label: "1242x1660" },
      { value: "1080x1260", label: "1080x1260" },
      { value: "1080x1080", label: "1080x1080" },
    ]
  },
  {
    label: "HD / 720P",
    options: [
      { value: "1280x720", label: "720P (1280x720)" },
      { value: "1146x717", label: "1146x717" },
      { value: "1080x608", label: "1080x608" },
    ]
  },
  {
    label: "SD / Others",
    options: [
      { value: "720x576", label: "576P (720x576)" },
      { value: "480x360", label: "360P (480x360)" },
    ]
  }
];

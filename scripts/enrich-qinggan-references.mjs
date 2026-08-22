import { readFile, writeFile } from 'node:fs/promises'

const appDataPath = 'src/data/qinggan-v10.json'
const sourcePaths = [
  'qinggan_kb/03_景点档案_干线核心景点.md',
  'qinggan_kb/04_景点档案_小众秘境景点.md',
]

function normalizeTitle(value) {
  return value
    .replace(/[❌✅⚠️]/gu, '')
    .replace(/\s+/g, '')
    .replace(/[“”"]/g, '')
    .trim()
}

function cleanMarkdown(value) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function classifyReference(url) {
  if (/bilibili|douyin|ixigua|youku|youtube/i.test(url)) return 'video'
  if (/map|qunar|ctrip|trip\.com/i.test(url)) return 'guide'
  return 'article'
}

function parseSections(markdown) {
  const matches = [...markdown.matchAll(/^###\s+(.+)$/gm)]
  return matches.map((match, index) => ({
    title: match[1].trim(),
    body: markdown.slice(
      (match.index || 0) + match[0].length,
      matches[index + 1]?.index ?? markdown.length,
    ),
  }))
}

function extractReferences(section, placeName) {
  const references = []
  const seen = new Set()
  const linkPattern = /(?<!!)\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
  for (const match of section.matchAll(linkPattern)) {
    const [, title, url] = match
    if (seen.has(url)) continue
    seen.add(url)
    references.push({
      title: cleanMarkdown(title),
      url,
      type: classifyReference(url),
    })
  }

  const fallbacks = [
    {
      title: `${placeName}攻略搜索`,
      url: `https://www.baidu.com/s?wd=${encodeURIComponent(`${placeName} 旅行攻略`)}`,
      type: 'article',
    },
    {
      title: `${placeName}游记搜索`,
      url: `https://www.bing.com/search?q=${encodeURIComponent(`${placeName} 游记`)}`,
      type: 'article',
    },
    {
      title: `${placeName}视频搜索`,
      url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(placeName)}`,
      type: 'video',
    },
  ]
  for (const reference of fallbacks.slice(0, 2)) {
    if (references.length >= 3) break
    if (!seen.has(reference.url)) {
      seen.add(reference.url)
      references.push(reference)
    }
  }

  if (!references.some((item) => item.type === 'video')) {
    references.push(fallbacks[2])
  }

  const limited = references.slice(0, 12)
  if (!limited.some((item) => item.type === 'video')) {
    limited[limited.length - 1] = references.find((item) => item.type === 'video')
  }
  return limited
}

function extractImages(section) {
  const images = []
  const seen = new Set()
  for (const match of section.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) {
    const [, caption, url] = match
    if (seen.has(url)) continue
    seen.add(url)
    images.push({ caption: cleanMarkdown(caption), url })
  }
  return images.slice(0, 4)
}

function extractField(section, label) {
  const start = section.match(new RegExp(`^- ${label}[^：]*：(.+)$`, 'm'))
  return start ? cleanMarkdown(start[1]).slice(0, 1200) : ''
}

const data = JSON.parse(await readFile(appDataPath, 'utf8'))
const sections = (
  await Promise.all(sourcePaths.map((path) => readFile(path, 'utf8')))
).flatMap(parseSections)

data.pois = data.pois.map((place) => {
  const normalizedName = normalizeTitle(place.name)
  const section = sections.find(({ title }) => {
    const normalizedSection = normalizeTitle(title)
    return (
      normalizedSection === normalizedName ||
      normalizedSection.includes(normalizedName) ||
      normalizedName.includes(normalizedSection)
    )
  })
  const body = section?.body || ''
  return {
    ...place,
    travelogue: extractField(body, '一手评价'),
    photo_tips: extractField(body, '拍照与穿搭建议'),
    images: extractImages(body),
    references: extractReferences(body, place.name),
  }
})

await writeFile(appDataPath, `${JSON.stringify(data, null, 2)}\n`)
console.log(
  `已补充 ${data.pois.length} 个地点、${data.pois.reduce(
    (total, place) => total + place.references.length,
    0,
  )} 条参考链接`,
)

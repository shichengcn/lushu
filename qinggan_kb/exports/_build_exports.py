#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
青甘大环线知识库 · 导出层构建脚本
--------------------------------------------------
输入：qinggan_kb/00..08 九册 Markdown（只读，不修改）
输出：qinggan_kb/exports/
  1. 青甘大环线知识库_全文合并.md
  2. itinerary_days.csv
  3. pois.csv
  4. knowledge_base.json
（README.md 为人工撰写，本脚本仅校验其行数）

原则：关键字段人工核对后写入数据字典；景点档案用正则/分节解析 03、04 两册；
      不编造数据，缺失一律留空字符串或 null。
运行：python3 qinggan_kb/exports/_build_exports.py
"""

import csv
import difflib
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
KB = os.path.dirname(HERE)
OUT = HERE

BOOKS = [
    ("00", "00_总览与路线决策.md", "全局决策：用户硬约束、逆时针vs顺时针评分、总里程口径、海拔剖面、时间锚点、9-12天砍点速查"),
    ("01", "01_主方案_逆时针12天逐日行程.md", "逐日执行：D1-D12 时间线、里程、门票、住宿、加油、信号、注意事项与全程汇总表"),
    ("02", "02_行程变体与可选加点.md", "时长变体（9/10/11/12天）、兰州进出变体、可选加点决策表与放弃清单"),
    ("03", "03_景点档案_干线核心景点.md", "干线核心景点 33 篇结构化档案 + doc1 四张原表 + 两册总索引"),
    ("04", "04_景点档案_小众秘境景点.md", "小众/秘境/需绕路景点 45 篇档案（德令哈琉璃湖、哈拉湖最详细）"),
    ("05", "05_驾驶_补能_信号_限速_路况.md", "租车、加油必满节点、信号盲区、限速执法、2026 封路风险、救援电话"),
    ("06", "06_高原健康_天气_穿衣_装备.md", "海拔剖面与高反处置、血氧阈值、沿线医院、逐站气温与日出日落、穿衣装备"),
    ("07", "07_住宿餐饮预算与票务预约.md", "真实酒店名与价格、餐饮点评、三档预算与 4 人 12 天换算、门票文档价vs实付价、预约提前期"),
    ("08", "08_国庆错峰与避坑总清单.md", "2026 假期与高速免费时段、逐日人流与错峰、最佳到达时刻表、避坑清单、行前 Checklist、应急预案"),
]

# ----------------------------------------------------------------------
# 1. 逐日行程数据字典（人工核对自 01_主方案_逆时针12天逐日行程.md）
# ----------------------------------------------------------------------

ITIN = [
    dict(
        day=1, date="2026-09-25", weekday="周五",
        theme="上海✈西宁 取车+市区适应",
        route="上海 ✈ 西宁曹家堡机场 → 机场租车门店取车 → 西宁市区",
        distance_km=30, drive_hours=0.6, play_hours=2.0,
        spots=["西宁市区（莫家街/水井巷）"],
        tickets="市区免费；可选 青海藏文化博物院60元/人、塔尔寺70元/人",
        altitude_points="西宁 2261m",
        meals="西宁水井巷 / 莫家街（手抓羊肉、酿皮子、牦牛酸奶、甜醅）",
        hotel="桔子酒店·西宁城东万达广场店", hotel_price_cny=273, hotel_city="西宁",
        hotel_alt="丽湖醉靓jing·绿松石民宿 ¥400",
        fuel_stop="取车时确认油量；西宁市区加满（西北多中石油少中石化）",
        signal_risk="市区满信号",
        notes=[
            "机场取车、采购补给；前 2 天适应海拔（doc2 D1）",
            "西宁海拔 2260m，到达后多喝水、少剧烈运动（doc1 Day1）",
            "前两天别洗澡、别喝酒（doc2 避雷第 5 条）",
            "采购清单：吃的、氧气瓶、高原安（飞书表 sheet D1）",
            "确认租车含道路救援险 + 不计免赔险；检查备胎、三角警示牌（doc1 第八章）",
            "备现金及 1 元零钞（观光车、旱厕、部分加油站只收现金）",
            "下载高德/百度离线地图包（doc2 Checklist）",
        ],
        key_notes=[
            "机场取车后先采购补给：氧气瓶(西宁药店20-30元/罐)、高原安、干粮、水",
            "前两天适应海拔：不洗澡、不喝酒、少剧烈运动",
            "确认租车含不计免赔+轮胎险并索取24h救援电话",
        ],
        timeline=[
            dict(time="12:00", action="落地西宁曹家堡机场（用户设定中午落地·推演）", road="", km=0),
            dict(time="", action="机场租车门店取车，办理约 30–60 分钟", road="", km=0),
            dict(time="", action="机场高速前往西宁市区酒店", road="机场高速", km=30),
            dict(time="", action="下午 入住 + 采购补给（吃的/氧气瓶/高原安）", road="", km=0),
            dict(time="", action="傍晚 水井巷 / 莫家街晚餐", road="", km=0),
            dict(time="", action="晚 可逛西宁新千夜市", road="", km=0),
        ],
        optional=["塔尔寺（距市区25km 往返约4h）", "拉脊山宗喀拉则 3820m（不顺路，建议放到 D10 或放弃）"],
    ),
    dict(
        day=2, date="2026-09-26", weekday="周六",
        theme="西宁→达坂山观景台→门源→仙米森林公园→祁连",
        route="西宁 ➜ 达坂山观景台 ➜ 门源 ➜ 仙米国家森林公园 ➜ 祁连",
        distance_km=420, drive_hours=6.5, play_hours=2.5,
        spots=["达坂山观景台", "门源", "仙米国家森林公园/聚阳沟"],
        tickets="达坂山免费；门源路过免费（9月底油菜花已凋谢）；仙米森林免费·聚阳沟20元/人",
        altitude_points="西宁 2261m → 达坂山观景台 3940m → 门源 2866m → 仙米森林 2500-3000m → 祁连 2780m（景阳岭垭口 3767m）",
        meals="门源县午餐（45min）；祁连晚餐 手抓羊肉",
        hotel="祁连宾馆", hotel_price_cny=381, hotel_city="祁连",
        hotel_alt="祁连吉缘饭店 ¥512（二选一）",
        fuel_stop="西宁出发前加满；门源可补充",
        signal_risk="G227 沿线基本有信号；达坂山垭口、仙米林区谷地间断",
        notes=[
            "首日海拔平缓过渡（doc2 D2）",
            "黑泉水库沿线大货车多、山路超车谨慎（doc2 D2）",
            "黑泉水库本身是免费顺路小景点，水色出片（doc3 实走 🌟🌟🌟）",
            "达坂山 3940m 为本日最高点，短暂停留，不要剧烈运动",
            "祁连山路段不适合开 NOA 辅助驾驶（山路急弯，doc1）",
            "10 月初高原早晚气温可能降至 0℃ 以下，羽绒服必备（research/B）",
            "9 月底–10 月祁连可能降雪封路；关注「青海交通」公众号（doc2 避雷第 4 条）",
        ],
        key_notes=[
            "达坂山3940m只停20-30分钟 不剧烈运动",
            "黑泉水库沿线大货车多 山路不超车",
            "仙米/聚阳沟秋色是本日核心 9月下旬-10月中旬彩林巅峰",
            "祁连山路段禁用辅助驾驶",
        ],
        timeline=[
            dict(time="08:00", action="西宁酒店出发", road="", km=0),
            dict(time="09:30", action="达坂山观景台（停留 30min）", road="G227", km=90),
            dict(time="12:00", action="门源县午餐（45min）", road="G227", km=80),
            dict(time="13:30", action="聚阳沟 / 仙米国家森林公园（游玩 2h）", road="门仙公路", km=50),
            dict(time="18:30", action="抵达祁连县酒店", road="门仙公路 → S302", km=180),
        ],
        optional=["黑泉水库（G227 沿线 免费 停 20 分钟）", "金银滩原子城（需向西绕行）"],
    ),
    dict(
        day=3, date="2026-09-27", weekday="周日",
        theme="祁连→卓尔山→祁连9号公路/二尕公路→肃南→张掖",
        route="祁连 ➜ 卓尔山 ➜ 祁连 9 号公路 ➜ 二尕公路 ➜ 肃南 ➜ 张掖",
        distance_km=350, drive_hours=8.0, play_hours=3.0,
        spots=["卓尔山", "祁连9号公路/二尕公路观景", "天山桥景区入口"],
        tickets="卓尔山 60元/人 + 观光车 15元/人（research/B 另称 80 元含车·存在差异）；9号/二尕公路免费",
        altitude_points="祁连县城 2780m → 卓尔山 3300m → 祁连9号/二尕公路约 3500m（research/B 称垭口 4120m·存在差异）→ 肃南 2500m → 张掖 1483m",
        meals="二尕公路路餐（自备干粮）；肃南县补给；晚餐 张掖味道美食街",
        hotel="星程酒店·张掖西站区政府店", hotel_price_cny=381, hotel_city="张掖",
        hotel_alt="如家商旅·张掖高铁西站大佛寺店 ¥313 / 全季·张掖西站区政府店 ¥421",
        fuel_stop="祁连出发前加满（山区150km+少站）；肃南县补充",
        signal_risk="二尕公路 / 祁连9号公路山区段多段无信号，必须离线地图",
        notes=[
            "卓尔山 60 元/人 + 观光车 15 元（doc2 D3）",
            "山路窄注意会车（doc2 D3 / 飞书表）",
            "查二尕公路是否封闭，雨雪改扁都口（doc2 D3 原文）",
            "重大冲突：G227 扁都口段封闭至 2027 年，doc2 的备选路线已不成立，需二次确认",
            "research/B 国庆预警：G227 施工导致祁连县至张掖段必堵，避开 9:00–11:00 大巴高峰",
            "祁连 9 号公路翻越 4000m+ 垭口，10 月初可能积雪冰冻，务必带防滑链、选 SUV",
            "祁连山路段禁用辅助驾驶（doc1）",
            "卓尔山 09:00 前上山人少（doc1 错峰逻辑）",
        ],
        key_notes=[
            "出发前必须查9号公路与二尕公路封路情况(2026-07滑坡曾封闭 08-04解除)",
            "扁都口备选已失效：G227峨堡-扁都口全幅封闭至2027年 遇雨雪只能祁连多住一晚或走G0611+S302",
            "山路窄注意会车 不在弯道超车 禁用辅助驾驶",
            "卓尔山08:20开园即入 避开9-11点大巴高峰",
        ],
        timeline=[
            dict(time="08:00", action="祁连酒店出发", road="", km=0),
            dict(time="08:20", action="卓尔山（游玩 2h）", road="县道", km=8),
            dict(time="14:00", action="二尕公路观景、路餐", road="祁连 9 号公路", km=150),
            dict(time="17:00", action="肃南县补给（停留 20min）", road="二尕公路 → G213", km=120),
            dict(time="19:00", action="抵达张掖酒店", road="G213", km=70),
            dict(time="", action="※ 雨雪、暗冰或管制时 doc2 原备选为扁都口—峨堡（2026 已封闭·改 G0611+S302 或祁连多住一晚）", road="", km=0),
        ],
        optional=["马蹄寺石窟（70-100元 需 3-4h）", "冰沟丹霞（40+20元 更适合 D4 上午）"],
    ),
    dict(
        day=4, date="2026-09-28", weekday="周一",
        theme="张掖→七彩丹霞→(嘉峪关路过)→敦煌 · 全天最长车程日",
        route="张掖 ➜ 七彩丹霞 ➜ 嘉峪关方向路过 ➜ 瓜州 ➜ 敦煌",
        distance_km=580, drive_hours=8.0, play_hours=2.8,
        spots=["张掖七彩丹霞", "嘉峪关（远观）"],
        tickets="七彩丹霞 93元/人（含区间车·doc2口径54+20）；嘉峪关三景通票110元（本次仅路过不进）",
        altitude_points="张掖 1483m → 七彩丹霞 1800-2000m → 嘉峪关 1700m → 敦煌 1139m",
        meals="嘉峪关/酒泉午餐（45min）；晚餐 敦煌沙洲夜市",
        hotel="汉庭酒店·敦煌沙洲夜市敦湖花园店", hotel_price_cny=179, hotel_city="敦煌",
        hotel_alt="doc3 警告：敦煌国庆涨价最凶，¥179 很可能订不到，可考虑民宿",
        fuel_stop="张掖出发前加满；嘉峪关/酒泉必须加满（嘉峪关→敦煌约390km），瓜州可补充",
        signal_risk="G30 连霍高速全程有信号",
        notes=[
            "全天最长车程早出发（doc2 D4）",
            "七彩丹霞晨拍（晨光/雨后佳）（doc2 D4）",
            "嘉峪关可远观（doc2 D4）",
            "七彩丹霞别踩地貌（doc2 避雷第 6 条）",
            "research/B：北门人流量巨大建议西门入园；出园时录指纹可激活次日票",
            "G30 连霍高速全程适合开 NOA，本日 470km 高速是全程最该用辅助驾驶的一天",
            "大风沙尘（敦煌/嘉峪关段）概率约 30%：关窗、减速行驶（doc1 应急预案）",
            "9 月底 10 月初七彩丹霞日落约 18:40–19:00（research/B），本方案上午入园看不到日落",
            "doc3 教训：他们 17:30 才到丹霞、天黑只玩 2h 拍不出效果，本方案 07:40 入园是修正",
        ],
        key_notes=[
            "全天580km最长车程 07:00发车 两名司机每2小时换手",
            "七彩丹霞开园即入(07:40) 建议西门进 别踩地貌",
            "嘉峪关只远观不进 保证20:00前到敦煌",
            "G30高速是全程最该用辅助驾驶的一天",
            "大风沙尘概率约30% 关窗降速",
        ],
        timeline=[
            dict(time="07:00", action="张掖酒店出发", road="", km=0),
            dict(time="07:40", action="七彩丹霞（晨光/游玩至 10:30）", road="丹霞景区道路", km=40),
            dict(time="14:00", action="嘉峪关/酒泉午餐（45min）", road="丹霞景区道路 → G30 连霍高速", km=210),
            dict(time="17:30", action="瓜州服务区（休息 15min）", road="G30 连霍高速", km=260),
            dict(time="20:00", action="抵达敦煌酒店", road="G30 → G3011", km=120),
        ],
        optional=["瓜州大地之子/无界（免费 停 30min·doc2 认为可略）", "瓜州榆林窟（绕路 1.5h 不建议插入）", "平山湖大峡谷（需额外 1 天）"],
    ),
    dict(
        day=5, date="2026-09-29", weekday="周二",
        theme="敦煌全天：莫高窟→鸣沙山月牙泉→沙洲夜市 · 全程唯一纯玩日",
        route="莫高窟 ➜ 鸣沙山月牙泉 ➜ 沙洲夜市",
        distance_km=30, drive_hours=0.5, play_hours=7.5,
        spots=["莫高窟", "鸣沙山·月牙泉", "沙洲夜市"],
        tickets="莫高窟 A 类 238元/人（B 类 100元）；鸣沙山月牙泉 110元/人（3天多次入）；沙洲夜市免费；骑骆驼约100-130元",
        altitude_points="敦煌 1139m；鸣沙山 1650m（doc3 写最高 1715m·存在差异）",
        meals="沙洲夜市 驴肉黄面、烤羊排、杏皮水",
        hotel="汉庭酒店·敦煌沙洲夜市敦湖花园店（连住第 2 晚）", hotel_price_cny=179, hotel_city="敦煌",
        hotel_alt="",
        fuel_stop="今日在敦煌市区把油加满（明日敦煌→大柴旦约380-500km 站极少）",
        signal_risk="市区满信号",
        notes=[
            "莫高窟 A 票 238 元，迟到作废（doc2 D5 / 飞书表）",
            "9.24 零点抢票（doc2）——与 doc1「提前60天8:00」、research/B「提前30天7:00」三方冲突，以官方公告为准",
            "比大部队早 2 天躲峰（doc3：顺逆两波人 10.4 前后相聚敦煌）",
            "鸣沙山傍晚星空演唱会、持票 3 天（doc2 D5）",
            "需提前半小时（建议 40-60 分钟）抵达数字展示中心（research/B）",
            "严禁窟内拍照；莫高窟禁飞无人机",
            "doc3 演唱会实况：8 点开始、核心区要提前 2 小时占位，下山很挤怕踩踏（research/B 称 21:30 开始·存在差异）",
            "敦煌飞天妆造约 300–600 元（含摄影），doc3 是 7:00-9:00 做妆造",
            "沙山难爬，上山顶一定走梯子（doc3）",
            "保护相机严防细沙（research/B）",
            "怕堵车可提前退场（doc3 9 点提前出演唱会）",
        ],
        key_notes=[
            "莫高窟A票238元 迟到作废 按预约时段提前40-60分钟到数字展示中心",
            "洞窟内严禁拍照 莫高窟禁飞无人机",
            "鸣沙山16:30入园看日落(约19:20-19:30) 110元票3天多次入",
            "上沙山一定走梯子 鞋套景区20元/双 外面15元/两双",
            "今晚在敦煌把油加满 明天进无人区",
        ],
        timeline=[
            dict(time="按预约时段", action="敦煌酒店出发（提前 40-60 分钟到数字展示中心）", road="市区道路", km=25),
            dict(time="", action="莫高窟数字展示中心 + 洞窟参观（约 3.5h）", road="", km=0),
            dict(time="", action="返回市区午餐、酒店休息", road="", km=0),
            dict(time="16:30", action="鸣沙山月牙泉（游玩至日落 19:20-19:30）", road="市区道路", km=5),
            dict(time="20:00", action="沙洲夜市（万人演唱会 20:00-22:00）", road="", km=0),
        ],
        optional=["玉门关+阳关（50+40元 需牺牲半天）", "敦煌雅丹魔鬼城（往返大半天）", "A 票没抢到：B 票 + 夜市 + 星空演唱会"],
    ),
    dict(
        day=6, date="2026-09-30", weekday="周三",
        theme="敦煌→苏干湖→阿克塞石油小镇→黑独山→大柴旦 · 重新爬升到 3000m+",
        route="敦煌 ➜ 苏干湖 ➜ 阿克塞石油小镇 ➜ 黑独山 ➜ 大柴旦",
        distance_km=500, drive_hours=8.0, play_hours=2.5,
        spots=["苏干湖", "阿克塞石油小镇", "黑独山"],
        tickets="苏干湖免费（2026 通告禁止徒步穿越仅远观）；阿克塞石油小镇 30元/人；黑独山免费含停车",
        altitude_points="敦煌 1139m → 苏干湖 2795m → 阿克塞 3000m → 当金山口 3648m → 黑独山 3200m → 大柴旦 3170m",
        meals="阿克塞石油小镇午餐；晚餐 大柴旦选择少偏贵 备干粮",
        hotel="桔子酒店·大柴旦翡翠湖步行街店", hotel_price_cny=266, hotel_city="大柴旦",
        hotel_alt="大柴旦翠湖驿 200-350元 / 大柴旦镇商务宾馆 100-200元",
        fuel_stop="敦煌出发前必须加满（最高级）；抵达大柴旦后加满",
        signal_risk="G215 阿克塞—当金山—大柴旦段信号弱，苏干湖信号差，离线地图必须提前下好",
        notes=[
            "当金山垭口 3648m 限速 40–60、下坡用发动机降挡控速（doc2 D6）",
            "石油小镇性价比低可略（doc2 D6 + 避雷第 6 条）",
            "当金山盘山路禁用辅助驾驶（急弯多、无护栏，doc1）",
            "翻过当金山后戈壁「路太好」最易超速（doc2 避雷第 2 条）",
            "9 月底–10 月当金山垭口可能降雪封路（doc2 避雷第 4 条）",
            "大柴旦 3170m 是第一个高海拔住宿点——doc3：大柴旦略微高反头疼的很；当晚别洗澡别喝酒早睡",
            "戈壁横风强，大车会车注意侧偏（doc2 避雷第 8 条）",
            "柴达木沙尘暴概率约 25%：红色预警时避免进无人区（doc1）",
            "苏干湖 2026 年通告禁止徒步穿越，仅能远观（research/A）",
        ],
        key_notes=[
            "重大不确定性：G215当金山K628-K670水毁后仅应急通行(限时09:00-20:00 曾仅允许青海→阿克塞单向) 若管制维持须改走G3011柳格高速 黑独山挪到D7早晨",
            "敦煌出发前必须把油加满 全段加油站极少",
            "当金山盘山限速40-60 禁用辅助驾驶 下坡用发动机降挡控速",
            "今晚睡大柴旦3170m 是全程高反第一风险点 禁酒禁洗澡早睡 睡前测血氧",
            "苏干湖仅可远观 禁止徒步穿越",
        ],
        timeline=[
            dict(time="08:00", action="敦煌酒店出发", road="G215", km=0),
            dict(time="11:00", action="苏干湖沿线观景（停留 30min·仅远观）", road="G215", km=170),
            dict(time="12:30", action="阿克塞石油小镇（停留 1h + 午餐）", road="G215（按当天路况）", km=0),
            dict(time="16:00", action="黑独山（停留 1h）", road="G215 → S305", km=170),
            dict(time="19:00", action="抵达大柴旦酒店", road="S305 → G215", km=110),
        ],
        optional=["小柴旦湖（免费 几乎零绕路 强烈建议插入）", "俄博梁/火星营地（需加 1 整天 不可插入）", "艾肯泉（茫崖方向 不可插入）", "冷湖赛什腾山天文台（核心区不开放）"],
    ),
    dict(
        day=7, date="2026-10-01", weekday="周四",
        theme="大柴旦→翡翠湖→水上雅丹→315 U型公路→格尔木 · 国庆首日在无人区天然错峰",
        route="大柴旦 ➜ 翡翠湖 ➜ 乌素特水上雅丹 ➜ 315 U 型公路 ➜ 格尔木",
        distance_km=500, drive_hours=8.0, play_hours=3.8,
        spots=["大柴旦翡翠湖", "乌素特水上雅丹", "315 U型公路"],
        tickets="翡翠湖 50-60元/人 + 小火车 60元/人；水上雅丹 60-120元/人 + 观光车 60元/人（存在差异）；U型公路免费",
        altitude_points="大柴旦 3170m → 翡翠湖 3170m（doc3 写3150m）→ 水上雅丹 2800m → U型公路约 3000m → 格尔木 2780m",
        meals="格尔木市区；中途无餐饮 必须带干粮",
        hotel="宜必思酒店·格尔木八一路昆仑广场店", hotel_price_cny=179, hotel_city="格尔木",
        hotel_alt="",
        fuel_stop="大柴旦出发前加满（最高级）；加油只在大柴旦/格尔木",
        signal_risk="全程最差：G315 大部分路段信号极弱或完全无服务，必须离线地图",
        notes=[
            "10.1 在无人区天然错峰（doc2 D7）",
            "全程信号弱，下离线地图（doc2 D7）",
            "加油只在大柴旦/格尔木（doc2 D7）",
            "U 型公路严禁停车（记 3 分罚 200）（doc2 D7）",
            "G315 U 型公路全程测速限速 80（doc2 避雷第 2 条）",
            "翡翠湖 08:00 早晨拍照（doc1 却建议 10:00-14:00 或 16:00 后·存在差异）；实操优先保证无人",
            "翡翠湖、察尔汗、水上雅丹风都很大（doc3 反复提到）",
            "无人区自驾风险最高段：备水和食物至少 3 天份（doc1）",
            "盐湖类景区无人机需报备（doc2 避雷第 9 条）",
            "G315 平坦段可用 ACC，但不建议全程 NOA（doc1）",
        ],
        key_notes=[
            "U型公路严禁路面停车拍照 罚200元记3分 只在合法观景台停",
            "全程无信号+加油只在大柴旦和格尔木 出发前加满油并下好离线地图",
            "翡翠湖07:30出发08:00到 早晨无风才有镜面倒影",
            "建议把顺序调整为翡翠湖(晨)→水上雅丹(午)→东台吉乃尔湖(傍晚) 东台是doc3全程口碑最高的免费点",
            "备足干粮与3天水 盐湖无人机需报备",
        ],
        timeline=[
            dict(time="07:30", action="大柴旦酒店出发（全程最早出发日）", road="", km=0),
            dict(time="08:00", action="大柴旦翡翠湖（早晨拍照 1.5h）", road="景区道路", km=15),
            dict(time="11:30", action="乌素特水上雅丹（游玩 2h）", road="柳格高速/大柴旦方向 → G315", km=145),
            dict(time="15:00", action="315 U 型公路（停留 20min·仅在合法观景点）", road="G315", km=180),
            dict(time="19:30", action="抵达格尔木酒店", road="G315", km=170),
        ],
        optional=["东台吉乃尔湖（免费或摆渡车60元 绕路约50km/1.5h 强烈建议插入）", "西台吉乃尔湖（免费）", "一里坪（免费）", "南八仙雅丹（免费 易迷路）"],
    ),
    dict(
        day=8, date="2026-10-02", weekday="周五",
        theme="格尔木→无极龙凤宫→昆仑山口→玉虚峰→西王母瑶池→格尔木 · 全程海拔最高日",
        route="格尔木 ➜ 无极龙凤宫 ➜ (不冻泉) ➜ 昆仑山口 ➜ 玉虚峰观景点 ➜ 西王母瑶池 ➜ 格尔木",
        distance_km=400, drive_hours=7.0, play_hours=2.2,
        spots=["无极龙凤宫", "不冻泉", "昆仑山口", "玉虚峰观景点", "西王母瑶池"],
        tickets="全部免费（无极龙凤宫/不冻泉/昆仑山口/玉虚峰/瑶池）",
        altitude_points="格尔木 2780m → 昆仑山口 4767m（全程最高）→ 玉虚峰 6178m（远眺）→ 西王母瑶池 4300m → 返格尔木 2780m",
        meals="格尔木市区；全天路上无餐饮 必须带足干粮和热水",
        hotel="宜必思酒店·格尔木八一路昆仑广场店（连住第 2 晚）", hotel_price_cny=179, hotel_city="格尔木",
        hotel_alt="",
        fuel_stop="格尔木出发前加满（往返 400km，G109 沿线加油站稀少）",
        signal_risk="G109 主干道部分有信号；瑶池支线基本无信号",
        notes=[
            "昆仑山口全程最高、可能降雪、查 G109 路况、买氧气瓶（doc2 D8）",
            "瑶池支线需 SUV（doc2 D8 + 飞书表）",
            "昆仑山口 9 月底可能遇降雪，提前查 G109 路况（飞书表）",
            "G109 大货车极多且波浪路严重（冻土层造成），驾车易起飞需谨慎（research/A）",
            "血氧红线：低于 90% 停车休息，低于 85% 立即下撤（doc1）",
            "4767m 处严禁剧烈运动、快走、跑跳；停留控制在 20-30 分钟内",
            "中度高反：立即下撤至少 500m 海拔 + 吸氧 + 联系 120（doc1）",
            "氧气瓶去正规药店买，不要在景区买（doc2 避雷第 7 条）",
            "若有人 D6 在大柴旦已有高反症状，本日应整体放弃或只到无极龙凤宫为止",
            "尊重藏区习俗：不逆转经筒，拍当地人先征得同意",
        ],
        key_notes=[
            "出发前测血氧 任何人低于90%都不上山 留格尔木休整",
            "昆仑山口4767m停留20-30分钟为硬上限 慢走不跑不跳不搬重物",
            "羽绒服+手套+帽子穿好再下车 山口可能降雪大风",
            "瑶池支线路况极差需SUV且基本无信号 有人头痛就当场掉头返格尔木",
            "G109冻土波浪路+大货车多 全程手动驾驶不用辅助",
            "封路或降雪就直接取消当日往返 改格尔木市内休整",
        ],
        timeline=[
            dict(time="08:30", action="格尔木酒店出发", road="", km=0),
            dict(time="09:15", action="无极龙凤宫（停留 20min）", road="G109 青藏公路", km=35),
            dict(time="", action="不冻泉/昆仑神泉（免费 常年3.5℃不结冰·doc2 时间线漏点 由飞书表补入）", road="G109", km=0),
            dict(time="11:30", action="昆仑山口 4767m（停留 30min 为上限）", road="G109", km=120),
            dict(time="12:15", action="玉虚峰观景点（停留 20min·导航名或为玉珠峰 需确认）", road="G109", km=15),
            dict(time="13:30", action="西王母瑶池 4300m（游玩 1h·需 SUV）", road="G109 → 瑶池支线", km=45),
            dict(time="18:00", action="返回格尔木酒店", road="原路返回 G109", km=185),
        ],
        optional=["格尔木胡杨林（50元 10月上旬全盛期 可放 D9 上午）", "本日已是最高海拔日 不建议再叠加加点"],
    ),
    dict(
        day=9, date="2026-10-03", weekday="周六",
        theme="格尔木→察尔汗盐湖→德令哈 · 最轻松的驾驶日之一",
        route="格尔木 ➜ 察尔汗盐湖 ➜ 德令哈",
        distance_km=270, drive_hours=5.0, play_hours=2.5,
        spots=["察尔汗盐湖"],
        tickets="察尔汗盐湖 60元/人 + 观光车30元或大巴40元（research/A 称102元含车·存在差异）",
        altitude_points="格尔木 2780m → 察尔汗 2680m → 德令哈 2980m",
        meals="格尔木方向午餐/补给（40min）；晚餐 德令哈市区选择多",
        hotel="全季酒店·德令哈巴音河畔店", hotel_price_cny=281, hotel_city="德令哈",
        hotel_alt="德令哈天空之城酒店 200-400元 / 市区商务酒店 150-300元",
        fuel_stop="格尔木出发前加满油；抵达德令哈后加满（德令哈→茶卡约200km 站稀）",
        signal_risk="察尔汗景区有信号；G315 格尔木—德令哈段基本有信号",
        notes=[
            "察尔汗最晒，墨镜必备（doc2 D9 + 避雷第 6 条）",
            "无人机报备（察尔汗需游客中心签字报备）",
            "格尔木出发前加满油（doc2 D9 + 飞书表）",
            "察尔汗风大、景区在工业区、配套差，做好心理预期（doc3）",
            "盐湖反光强，偏光墨镜（UV400）保护眼睛（doc1）",
            "本日车程短，是补觉与恢复日，D8 高海拔后正好缓冲",
        ],
        key_notes=[
            "察尔汗最晒 UV400偏光墨镜必备",
            "无人机须到游客中心签字报备",
            "格尔木出发前加满油 德令哈到达后再加满",
            "本日车程短 是D8高海拔后的恢复日 可补觉",
            "建议补入托素湖与海子诗歌陈列馆(免费 10:00-17:30关门)",
        ],
        timeline=[
            dict(time="08:00", action="格尔木酒店出发", road="", km=0),
            dict(time="09:30", action="察尔汗盐湖（游玩 2.5h）", road="G3011 → 盐湖景区道路", km=60),
            dict(time="12:30", action="格尔木方向午餐/补给（40min）", road="盐湖景区道路 → G3011", km=50),
            dict(time="17:00", action="抵达德令哈酒店", road="G315", km=230),
        ],
        optional=["托素湖（飞书表列入 doc2 漏 建议补上）", "海子诗歌陈列馆（免费 10:00-17:30）", "柏树山（免费）", "德令哈琉璃湖奶子湖（需四驱 占大半天）", "哈拉湖（明确放弃）"],
    ),
    dict(
        day=10, date="2026-10-04", weekday="周日",
        theme="德令哈→茶卡盐湖→青海湖→西宁 还车 · 逆时针最大代价日",
        route="德令哈 ➜ 茶卡盐湖 ➜ 黑马河 ➜ 环湖西路 ➜ 西宁",
        distance_km=500, drive_hours=8.0, play_hours=3.0,
        spots=["茶卡盐湖", "东格尔观景台", "黑马河", "环湖西路观景"],
        tickets="茶卡盐湖 60元/人 + 小火车单程50元/人；青海湖环湖西路免费（二郎剑90元/仙女湾60元 本次不进）",
        altitude_points="德令哈 2980m → 茶卡 3059m → 青海湖 3196m → 西宁 2261m",
        meals="黑马河附近午餐（40min）；晚餐 西宁市区（莫家街手抓羊肉、酿皮、甜醅）",
        hotel="桔子酒店·西宁城东万达广场店", hotel_price_cny=327, hotel_city="西宁",
        hotel_alt="与 D1 同店但涨价 ¥54（¥273→¥327），建议分两单订",
        fuel_stop="德令哈出发前加满；还车前按租车合同要求加满",
        signal_risk="G315/G109 沿线基本有信号；环湖西路部分路段弱",
        notes=[
            "茶卡穿鞋套、停官方场（doc2 D10 + 避雷第 6 条）",
            "青海湖环湖西路牧民点更纯净别私闯（doc2 D10）",
            "返西宁段易堵早出发（doc2 D10）",
            "当晚/次日还车（doc2 D10）",
            "逆时针最大代价：茶卡/青海湖 D10 下午到会逆光；建议提前到 07:00 出发争取上午到茶卡",
            "青海湖环湖 G109（倒淌河–黑马河，尤其江西沟–黑马河）区间测速严，看平均速度",
            "茶卡依赖天气：阴天可果断放弃（doc3）；07:00–09:00 湖面最平静，09:30 后人流暴增",
            "10.4 是顺时针大部队返程日，G109 西宁方向下午会堵",
            "藏区习俗：藏民多不吃鱼（尤其湟鱼），拍当地人先征得同意",
            "茶卡穿搭：纯白/浅粉/淡蓝，禁深色鞋，带一双雨鞋（doc1）",
            "不买景区兜售的玉石珠宝（多假货），民族披肩比价",
        ],
        key_notes=[
            "建议提前到07:00出发 争取上午到茶卡 否则下午逆光",
            "茶卡退出规则：早7点看天 风大或阴天直接跳过 时间给青海湖",
            "环湖G109区间测速极严 主动按70km/h匀速",
            "10.4是顺时针大军返程日 G109西宁方向下午易堵 早出发",
            "茶卡穿鞋套并停官方停车场 环湖西路牧民草场不可私闯",
            "还车前按合同加满油 当晚或次日上午还车",
        ],
        timeline=[
            dict(time="08:00", action="德令哈酒店出发（建议提前到 07:00）", road="", km=0),
            dict(time="11:30", action="茶卡盐湖（游玩 2h·阴天大风可跳过）", road="G315", km=200),
            dict(time="14:00", action="黑马河附近午餐（40min）", road="G315 → G109", km=90),
            dict(time="15:30", action="青海湖沿线观景（东格尔观景台/环湖西路 停留 1h）", road="环湖西路", km=80),
            dict(time="20:00", action="抵达西宁酒店（当晚或次日上午还车）", road="G109", km=150),
        ],
        optional=["拉脊山宗喀拉则（绕路 60-80km 不建议）", "青海湖仙女湾 60元（不顺路）", "贵德黄河清 / 坎布拉（各需 1 天）"],
    ),
    dict(
        day=11, date="2026-10-05", weekday="周一",
        theme="西宁 →(高铁)→ 兰州 兰州市区休整",
        route="西宁酒店 → 西宁站 → 高铁（约1.5h）→ 兰州西站 → 黄河母亲像 → 中山桥 → 白塔山 → 正宁路/南关夜市",
        distance_km=0, drive_hours=0.0, play_hours=5.0,
        spots=["黄河母亲雕塑", "兰州中山桥", "白塔山", "正宁路/南关夜市"],
        tickets="景点全部免费；西宁→兰州高铁约 60元/人（需提前购）",
        altitude_points="西宁 2261m → 兰州 1520m",
        meals="正宁路夜市（清真有奴思烤肉店·正宁路249号 ¥81/人）",
        hotel="全季酒店·兰州南关十字亚欧国际店", hotel_price_cny=351, hotel_city="兰州",
        hotel_alt="",
        fuel_stop="无（已还车）",
        signal_risk="全程满信号",
        notes=[
            "高铁票约 ¥60/人 提前购；西宁站早到（doc2 D11）",
            "若 D10 当晚未还车，本日上午务必先还车再去高铁站",
            "兰州夜市人多，注意财物",
            "特产采购：牦牛肉干、黑枸杞、藏红花、青稞酒（doc1）",
            "兰州海拔 1520m，高原反应彻底解除，可以正常洗澡喝酒",
        ],
        key_notes=[
            "高铁票约60元/人需提前购 西宁站要早到",
            "若D10未还车 今天上午先还车再去高铁站",
            "兰州1520m 高反解除 可正常洗澡喝酒",
            "正宁路夜市本地人也去 每家都好吃 注意财物",
        ],
        timeline=[
            dict(time="上午", action="西宁酒店出发前往西宁站（早到）", road="市区", km=0),
            dict(time="", action="高铁 西宁→兰州西（约 1.5h / 216km）", road="兰新高铁", km=216),
            dict(time="", action="兰州酒店办理入住", road="", km=0),
            dict(time="下午", action="黄河母亲像 — 中山桥 — 白塔山（步行约 1.8km）", road="", km=0),
            dict(time="晚上", action="正宁路 / 南关夜市", road="", km=0),
        ],
        optional=["甘肃省博物馆（马踏飞燕原件）", "西宁北禅寺或南山公园（出发前上午）"],
    ),
    dict(
        day=12, date="2026-10-06", weekday="周二",
        theme="兰州送机返程",
        route="兰州酒店 → 城际铁路或机场高速 → 兰州中川国际机场 → 返程",
        distance_km=75, drive_hours=1.0, play_hours=0.0,
        spots=[],
        tickets="无",
        altitude_points="兰州 1520m → 中川机场 1947m",
        meals="机场或酒店早餐",
        hotel="", hotel_price_cny=None, hotel_city="",
        hotel_alt="",
        fuel_stop="无",
        signal_risk="满信号",
        notes=[
            "预留 2.5–3h；建议订下午航班（doc2 D12）",
            "兰州中川机场距市区约 75km，城际铁路或机场高速均需约 1h",
            "头天晚上整理好行李、打包特产（doc1）",
        ],
        key_notes=[
            "兰州中川机场距市区约75km 预留2.5-3小时 建议订下午航班",
            "10.5-10.6是全国返程高峰 机场/车站提前3小时到",
            "前一晚整理行李并打包特产",
        ],
        timeline=[
            dict(time="按航班时间", action="兰州酒店出发", road="", km=0),
            dict(time="", action="城际铁路或机场高速前往兰州中川国际机场（约 1h）", road="城际铁路/机场高速", km=75),
            dict(time="", action="办理值机、返程", road="", km=0),
        ],
        optional=["若航班在傍晚：甘肃省博物馆或兰州水车博览园"],
    ),
]


# ----------------------------------------------------------------------
# 2. 景点档案解析（03 干线核心 + 04 小众秘境）
# ----------------------------------------------------------------------

FIELD_MAP = [
    ("一句话定位", "summary"),
    ("别名", "aliases"),
    ("所在地", "region_full"),
    ("位置与导航", "nav"),
    ("距最近城镇", "distance_note"),
    ("海拔", "altitude"),
    ("门票", "ticket_raw"),
    ("开放时间", "open_time"),
    ("建议游玩时长", "visit_raw"),
    ("最佳时段", "best_time"),
    ("路况与车型", "road"),
    ("手机信号", "signal"),
    ("停车", "facility"),
    ("景观特色", "scenery"),
    ("一手评价", "review"),
    ("拍照", "photo"),
    ("注意事项", "cautions"),
    ("推荐结论", "recommendation"),
    ("参考链接", "refs"),
    ("图片", "images"),
]

CATEGORY_RULES = [
    ("盐湖", ["察尔汗", "茶卡", "翡翠湖", "盐湖"]),
    ("湖泊", ["湖", "瑶池", "泉"]),
    ("雅丹地貌", ["雅丹", "俄博梁", "南八仙"]),
    ("丹霞地貌", ["丹霞"]),
    ("公路景观", ["公路", "U型"]),
    ("垭口/山口", ["垭口", "山口"]),
    ("山岳/雪峰", ["山", "峰", "岭"]),
    ("石窟/寺庙", ["寺", "窟", "佛洞", "清真", "宫", "庙"]),
    ("沙漠绿洲", ["鸣沙山", "月牙泉", "胡杨"]),
    ("草原/湿地", ["草原", "湿地", "军马场", "滩", "金银滩"]),
    ("森林", ["森林", "林", "聚阳沟"]),
    ("水库", ["水库"]),
    ("城镇/夜市/美食", ["夜市", "莫家街", "水井巷", "县", "肃南", "德令哈", "鱼卡"]),
    ("遗址/古迹/关隘", ["遗址", "古城", "关", "城", "小镇", "基地", "军马", "大地之子", "无界", "151"]),
    ("博物馆/展馆", ["博物", "展馆", "陈列", "天文台"]),
]

# 关键词猜错时的人工分类覆盖
NAME_CATEGORY = {
    "鸣沙山 · 月牙泉": "沙漠绿洲",
    "黑泉水库": "水库",
    "昆仑山深度段：无极龙凤宫 / 不冻泉 / 昆仑山口 / 玉珠峰 / 西王母瑶池": "高原山口综合线路",
    "冷湖石油小镇遗址": "遗址/古迹/关隘",
    "赛什腾山天文台（冷湖天文观测基地）": "博物馆/展馆",
    "艾肯泉（恶魔之眼）": "地质奇观/泉",
    "一里坪": "盐湖",
    "平山湖大峡谷": "峡谷",
    "黑河大峡谷": "峡谷",
    "倒淌河": "城镇/补给站",
    "扁都口": "垭口/山口",
    "拉脊山（宗喀拉则）· 可选": "垭口/山口",
    "门源（油菜花海 / 岗什卡雪峰方向）": "草原/花海",
    "祁连大草原 / 阿柔大寺": "草原/湿地",
    "山丹军马场": "草原/牧场",
    "贵德国家地质公园（阿什贡七彩峰丛）与\"天下黄河贵德清\"": "丹霞地貌",
    "焉支山": "山岳/雪峰",
    "柏树山": "山岳/雪峰",
    "外星人遗址 / 白公山": "遗址/古迹/关隘",
    "沙岛与鸟岛（已封闭，不可进入）": "湖泊（已封闭）",
    "德令哈（海子诗歌陈列馆 / 巴音河）": "城镇/夜市/美食",
}


def clean_md(text):
    """去 markdown 标记、链接、来源括注，压成单行。"""
    if not text:
        return ""
    t = text
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", t)              # 图片
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)           # 链接保留文字
    t = t.replace("**", "").replace("`", "")
    t = re.sub(r"^\s*[-*]\s*", "", t, flags=re.M)
    t = re.sub(r"^\s*\d+\.\s+", "", t, flags=re.M)
    t = re.sub(r"[🔴🟠🟡🟢✅⚠️❌👀]", "", t)
    t = re.sub(r"\s+", " ", t)
    t = t.replace("（ ", "（").replace(" ）", "）")
    return t.strip(" ；;·|")


def cut(text, limit=160):
    t = clean_md(text)
    if len(t) <= limit:
        return t
    return t[:limit].rstrip("（(、；;：: ") + "…"


def field_of(line):
    """识别 '- 字段名（补注）：值' 形式的字段，返回 (key, value)。"""
    s = line[2:].strip()
    s = s.replace("**", "")
    for prefix, key in FIELD_MAP:
        if s.startswith(prefix):
            rest = s[len(prefix):]
            masked = re.sub(r"（[^）]*）", lambda m: "〓" * len(m.group(0)), rest)
            idx = masked.find("：")
            if idx == -1:
                idx = masked.find(":")
            value = rest[idx + 1:] if idx != -1 and idx <= 30 else rest
            return key, value.strip()
    return None, ""


def parse_poi_book(path, default_niche):
    """解析景点档案册，返回 [dict]。"""
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")

    records = []
    cur = None
    cur_field = None
    section = ""
    for line in lines:
        if line.startswith("## "):
            section = clean_md(line[3:])
            continue
        if line.startswith("### "):
            if cur:
                records.append(cur)
            cur = {"name": clean_md(line[4:]), "section": section,
                   "fields": {}, "default_niche": default_niche}
            cur_field = None
            continue
        if cur is None:
            continue
        if line.startswith("## ") or line.startswith("# "):
            continue
        if line.startswith("- "):
            key, value = field_of(line)
            cur_field = key
            if key:
                cur["fields"][key] = cur["fields"].get(key, "") + " " + value
            continue
        if cur_field and line.strip():
            cur["fields"][cur_field] = cur["fields"].get(cur_field, "") + " " + line.strip()
    if cur:
        records.append(cur)
    # 过滤附录里的非景点小节
    records = [r for r in records if r["fields"].get("ticket_raw") or r["fields"].get("recommendation")]
    return records


def table_rows(path, heading, ncol=7):
    """取指定标题小节内的表格数据行（已按 | 切分并清洗）。"""
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    level = len(heading) - len(heading.lstrip("#"))
    start = None
    for i, line in enumerate(lines):
        if line.strip().startswith(heading):
            start = i + 1
            break
    if start is None:
        return []
    out = []
    for line in lines[start:]:
        stripped = line.strip()
        if stripped.startswith("#"):
            cur_level = len(stripped) - len(stripped.lstrip("#"))
            if cur_level <= level and out:
                break
            if cur_level <= level:
                continue
        if not stripped.startswith("|"):
            continue
        cells = [clean_md(c) for c in stripped.strip("|").split("|")]
        if len(cells) != ncol:
            continue
        if cells[0] in ("景点名", "") or set(cells[0]) <= set("-: "):
            continue
        out.append(cells)
    return out


def parse_index_03(path):
    """03 附录 E1/E2：景点名|片区|门票|建议时长|星级推荐度|是否小众|所属天数。"""
    rows = {}
    for heading in ("### E1 ·", "### E2 ·"):
        for c in table_rows(path, heading):
            rows[c[0]] = dict(name=c[0], region=c[1], ticket=c[2], hours=c[3],
                              rating=c[4], niche=c[5], day=c[6])
    return rows


def parse_index_04(path):
    """04 小众景点总索引表：景点名|片区|门票|建议时长|是否需绕路|推荐结论|可插入天数。"""
    rows = {}
    for c in table_rows(path, "## 小众景点总索引表"):
        rows[c[0]] = dict(name=c[0], region=c[1], ticket=c[2], hours=c[3],
                          detour=c[4], recommendation=c[5], day=c[6])
    return rows



def norm_name(s):
    return re.sub(r"[^\u4e00-\u9fffA-Za-z0-9]", "", s)


# 长标题 → 索引表简写名的人工对照（自动模糊匹配失败的条目）
INDEX_ALIAS = {
    "肃南（裕固族自治县）": "肃南",
    "昆仑山深度段：无极龙凤宫 / 不冻泉 / 昆仑山口 / 玉珠峰 / 西王母瑶池": "昆仑山深度段（5点位）",
    "青海湖（二郎剑 / 仙女湾 / 环湖西路 / 尕海 / 黑马河日出 / 东格尔观景台 / 尕日拉寺）": "青海湖（多点位）",
    "嘉峪关关城 · 悬臂长城 · 天下第一墩（三景通票）": "嘉峪关三景通票",
    "阿克塞石油小镇（博罗转井影视基地）": "阿克塞石油小镇",
    "德令哈（海子诗歌陈列馆 / 巴音河）": "德令哈（海子馆/巴音河）",
    "西宁新千夜市 / 莫家街 / 水井巷": "新千夜市·莫家街·水井巷",
    "仙米国家森林公园 · 聚阳沟": "仙米森林公园·聚阳沟",
    "祁连 9 号公路（G213 祁连段）": "祁连9号公路",
    "二尕公路（二尕线）": "二尕公路",
    "达坂山观景台（大坂山垭口）": "达坂山观景台",
    "门源（油菜花海 / 岗什卡雪峰方向）": "门源（油菜花/岗什卡）",
    "苏干湖（大苏干湖）": "苏干湖",
    "拉脊山（宗喀拉则）· 可选": "拉脊山（宗喀拉则）",
    "贵德国家地质公园（阿什贡七彩峰丛）与\"天下黄河贵德清\"": "贵德黄河清",
    "敦煌雅丹国家地质公园（魔鬼城）": "敦煌雅丹魔鬼城",
    "外星人遗址 / 白公山": "外星人遗址·白公山",
    "瓜州大地之子 / 无界雕塑群": "瓜州大地之子/无界",
    "茫崖冷湖 · 琉璃之境（如意湖）": "茫崖冷湖·琉璃之境如意湖",
    "赛什腾山天文台（冷湖天文观测基地）": "赛什腾山天文台",
    "可鲁克湖 · 托素湖": "可鲁克湖·托素湖",
    "沙岛与鸟岛（已封闭，不可进入）": "沙岛与鸟岛",
}


def match_index(name, index_rows, used):
    alias = INDEX_ALIAS.get(name)
    if alias and alias in index_rows:
        used.add(alias)
        return index_rows[alias]
    keys = [k for k in index_rows if k not in used]
    nk = norm_name(name)
    best, best_ratio = None, 0.0
    for k in keys:
        r = difflib.SequenceMatcher(None, nk, norm_name(k)).ratio()
        if r > best_ratio:
            best, best_ratio = k, r
    if best and best_ratio >= 0.55:
        used.add(best)
        return index_rows[best]
    return None


def nums(text):
    return [int(x) for x in re.findall(r"\d+", text or "")]


SHUTTLE_KWS = ("观光车", "摆渡车", "区间车", "小火车", "火车", "大巴", "环保车", "车")


def parse_ticket(idx_ticket, ticket_raw):
    """把速查票价字符串解析成 (ticket_cny, shuttle_cny)，解析不出留空字符串。"""
    src = idx_ticket or clean_md(ticket_raw)[:60]
    s = re.sub(r"（[^）]*）|\([^)]*\)", "", src)
    s = re.split(r"[=＝]", s)[0]
    s = s.replace("，", " ").replace("；", " ").replace("、", " ").replace("/", " ")
    ticket, shuttle = "", ""
    for seg in re.split(r"[+＋]", s):
        if "停车" in seg:
            continue
        m = re.search(r"(\d+)\s*[—\-~至到]\s*(\d+)\s*元", seg)
        if m:
            val = "%s-%s" % (m.group(1), m.group(2))
        else:
            m2 = re.search(r"(\d+)\s*元", seg)
            if m2:
                val = m2.group(1)
            else:
                m3 = re.match(r"^\s*约?(\d+)\s*$", seg)
                val = m3.group(1) if m3 else ""
        if not val:
            continue
        if any(k in seg for k in SHUTTLE_KWS):
            if shuttle == "":
                shuttle = val
        elif ticket == "":
            ticket = val
    mfree = re.search(r"免[费票]\s*[—\-~]\s*(\d+)\s*元", s)
    if mfree:
        ticket = "0-" + mfree.group(1)
    elif ticket == "" and re.search(r"免[费票]", s):
        ticket = "0"
    return ticket, shuttle



def parse_altitude(text):
    t = clean_md(text)
    m = re.findall(r"(\d{3,4})\s*[—\-~到至]\s*(\d{3,4})\s*m", t)
    if m:
        return f"{m[0][0]}-{m[0][1]}"
    m2 = re.search(r"(\d{3,4})\s*m", t)
    if m2:
        return m2.group(1)
    n = nums(t)
    return str(n[0]) if n else ""


def guess_category(name, summary, section):
    if name in NAME_CATEGORY:
        return NAME_CATEGORY[name]
    hay = f"{name} {summary} {section}"
    for cat, kws in CATEGORY_RULES:
        for kw in kws:
            if kw in name:
                return cat
    for cat, kws in CATEGORY_RULES:
        for kw in kws:
            if kw in hay:
                return cat
    return "综合/其他"


def first_url(text):
    m = re.search(r"\((https?://[^)\s]+)\)", text or "")
    if m:
        return m.group(1)
    m2 = re.search(r"(https?://\S+)", text or "")
    return m2.group(1) if m2 else ""


def rec_short(text):
    t = clean_md(text)
    t = t.split("。")[0]
    t = re.split(r"理由|——|：", t)[0]
    return t.strip()[:60]


def build_pois():
    p03 = os.path.join(KB, BOOKS[3][1])
    p04 = os.path.join(KB, BOOKS[4][1])
    idx3 = parse_index_03(p03)
    idx4 = parse_index_04(p04)
    used3, used4 = set(), set()
    recs = [(r, 0) for r in parse_poi_book(p03, 0)]
    recs += [(r, 1) for r in parse_poi_book(p04, 1)]

    pois = []
    for r, book in recs:
        f = r["fields"]
        row = match_index(r["name"], idx3, used3) or {}
        row4 = (match_index(r["name"], idx4, used4) or {}) if book == 1 else {}
        ticket, shuttle = parse_ticket(row4.get("ticket") or row.get("ticket", ""),
                                       f.get("ticket_raw", ""))
        niche_src = row.get("niche", "")
        if niche_src:
            is_niche = 0 if niche_src.strip() == "否" else 1
        else:
            is_niche = book
        region = row4.get("region") or row.get("region") or cut(f.get("region_full", ""), 24)
        rating = row.get("rating", "")
        recommendation = cut(row4.get("recommendation")
                             or rec_short(f.get("recommendation", ""))
                             or rating, 90)
        detour = row4.get("detour", "") or cut(f.get("distance_note", ""), 110)
        pois.append(dict(
            name=r["name"],
            aliases=cut(f.get("aliases", ""), 80),
            region=region,
            category=guess_category(r["name"], f.get("summary", ""), r["section"]),
            is_niche=is_niche,
            ticket_cny=ticket,
            shuttle_cny=shuttle,
            altitude_m=parse_altitude(f.get("altitude", "")),
            visit_hours=row4.get("hours") or row.get("hours") or cut(f.get("visit_raw", ""), 40),
            best_time=cut(f.get("best_time", ""), 150),
            road_requirement=cut(f.get("road", ""), 150),
            signal=cut(f.get("signal", ""), 90),
            rating=rating or cut(f.get("review", ""), 60),
            recommendation=recommendation,
            suggested_day=row.get("day") or row4.get("day", ""),
            detour_note=cut(detour, 110),
            ref_url=first_url(f.get("refs", "")),
            ticket_detail=cut(f.get("ticket_raw", ""), 150),
            summary=cut(f.get("summary", ""), 140),
            open_time=cut(f.get("open_time", ""), 90),
            source_book="03_干线核心景点" if book == 0 else "04_小众秘境景点",
        ))
    return pois


# ----------------------------------------------------------------------
# 3. 其余结构化数据字典（人工核对自 00 / 05 / 06 / 07 / 08 各册）
# ----------------------------------------------------------------------

META = {
    "title": "2026 国庆青甘大环线 · 逆时针 12 天自驾知识库",
    "user_setting": {
        "people": "4 名成人 + 行李",
        "from_city": "上海",
        "arrive": "2026-09-25 中午落地西宁曹家堡机场",
        "pickup": "机场租车门店取车",
        "dropoff": "西宁市区还车（D10 晚）",
        "vehicle": "SUV（燃油/增程优先），至少 2 名司机，建议带 ACC + 车道保持",
        "return": "D11 西宁→兰州高铁（约60元/人），D12 兰州中川机场返程",
        "daily_rule": "每天 08:00 前发车；最晚 18:00 前抵达当晚落脚点",
    },
    "date_range": {"start": "2026-09-25", "end": "2026-10-06", "days": 12},
    "direction": "逆时针（反穿：西宁→祁连→张掖→敦煌→柴达木→格尔木→德令哈→茶卡→青海湖→西宁）",
    "distance_km": {
        "self_drive_plan": 3580,
        "with_lanzhou_transfer": 3655,
        "recommended_range": "3550-3600（规划口径）",
        "upper_bound_with_buffer": 3900,
        "note": "四份原始资料里程口径不同（2466/2600/3207/3550），本知识库采用 doc2 逐日相加口径并预留 +10%",
    },
    "spot_count": {"main": 32, "with_optional": 35},
    "highest_point": {"name": "昆仑山口", "altitude_m": 4767, "day": 8},
    "first_high_altitude_night": {"place": "大柴旦", "altitude_m": 3170, "day": 6},
    "hardest_days": ["D4 张掖→敦煌 580km", "D6 敦煌→大柴旦 500km", "D7 G315 无人区 500km", "D10 德令哈→茶卡→青海湖→西宁 500km"],
    "books": [{"no": no, "file": fn, "purpose": desc} for no, fn, desc in BOOKS],
    "last_verified": "2026-08-21",
    "disclaimer": "票价 / 路况 / 假期政策 / 酒店价格均为 2026-08 时点资料，出行前 3 天必须按官方渠道二次确认。",
}

ROUTE_DECISION = {
    "conclusion": "维持逆时针（反穿）",
    "score_table": {
        "source": "doc1《2026青甘大环线11天自驾终极攻略》四维评分（原文为五一版本，方法论可套用国庆）",
        "dimensions": [
            {"dimension": "摄影光线", "clockwise": 6, "counterclockwise": 9,
             "reason": "七彩丹霞、鸣沙山均为顺光黄金时段抵达"},
            {"dimension": "错峰", "clockwise": 5, "counterclockwise": 8,
             "reason": "甘肃段早于假期高峰，青海段在假期中后段"},
            {"dimension": "海拔适应", "clockwise": 5, "counterclockwise": 9,
             "reason": "先在低海拔甘肃适应，再进入青海高原"},
            {"dimension": "景色递进", "clockwise": 6, "counterclockwise": 9,
             "reason": "绚烂色彩→荒野星辰→盐湖天空→天境收尾"},
        ],
        "total": {"clockwise": "22/40", "counterclockwise": "35/40", "gap": "反穿胜出 13 分"},
    },
    "supporting_facts": [
        "doc3 一手实走：国庆逆向完全不堵车，全程顶着限速开",
        "doc3 一手实走：顺/逆两波人 10.4 前后相聚敦煌；本方案敦煌在 9.28-9.29，早于峰值",
        "9.28-9.30 是工作日（2026 中秋 9.25-9.27 假、国庆 10.1-10.7 假），张掖/莫高窟/鸣沙山刚好排在工作日",
        "10.1 当天位于柴达木无人区（大柴旦→翡翠湖→水上雅丹→格尔木），是全国最挤那天最不挤的位置",
    ],
    "cost_accepted": [
        "青海湖/茶卡排在 D10（10.4）下午，易逆光，且撞上顺时针人流返程高峰",
        "缓解：D10 07:00 前出发争取上午到茶卡；若阴天/大风，按 doc3 建议果断放弃茶卡",
    ],
    "duration_variants": {
        "9天": "砍昆仑山深度日、嘉峪关、仙米，简化祁连",
        "10天": "保留茶卡/格尔木/察尔汗，砍昆仑山深度日",
        "11天": "保留昆仑山，砍仙米或二尕/祁连9号公路之一，西宁返程",
        "12天": "完整主方案（本知识库主线）",
    },
    "cut_priority": "详见 00 册 §6.1 砍点优先级（从最先该砍到最不该砍）",
}

# 三处必须出行前确认的冲突（00 册 §5.1）
OPEN_CONFLICTS = [
    "莫高窟 A 票放票时间：doc2 写 9.24 零点抢票、另有口径为提前 1 个月 07:00 放票 —— 两个闹钟都设",
    "G227 峨堡–扁都口全幅封闭至 2027，doc2 的『雨雪改走扁都口』备选已失效",
    "2026 国庆高速免费时段（普遍口径 10.1 00:00–10.7 24:00，7 座及以下客车），需按交通运输部/省交警最新通告确认",
]

MEDICINES = [
    {"item": "红景天（胶囊/口服液）", "usage": "提前 7 天开始（另一口径 5-7 天），持续到高原行程结束",
     "note": "提前 1-2 天吃基本无效；本次行动日 9.18 开始"},
    {"item": "葡萄糖（口服液/粉/含片）", "usage": "上垭口前 15-30 分钟一支；头晕时补一支",
     "note": "便宜体积小，务必多带"},
    {"item": "布洛芬/对乙酰氨基酚", "usage": "头痛时按说明服用", "note": "注意与感冒药重复成分"},
    {"item": "感冒药、肠胃药、创可贴", "usage": "常备", "note": "高原感冒可能诱发肺水肿；上高原前已感冒发烧应推迟或降级行程"},
    {"item": "便携氧气瓶", "usage": "D1 西宁市区药店买 4-6 罐（4 人各 1 + 2 备用）",
     "note": "西宁药店 20-30 元/罐；景区门口 50-80 元/罐；不要到大柴旦或昆仑山口现场买"},
    {"item": "血氧仪", "usage": "每人早晚各测一次并记录（重点 D6 大柴旦夜、D8 昆仑山口前后）",
     "note": "4 人共用 1-2 台即可；测量时手指温暖、静坐 2 分钟"},
    {"item": "唇膏 + 保湿霜 + 芦荟胶", "usage": "每天多次", "note": "doc3 实走：西北真的很干，润唇膏一定要带"},
]

HOSPITALS = [
    {"city": "西宁", "altitude_m": 2261, "name": "青海大学附属医院 / 青海省人民医院", "level": "三甲，省内最强",
     "phone": "120（具体号码通过 114/官方渠道查询）", "note": "全程医疗兜底"},
    {"city": "门源/祁连", "altitude_m": 2787, "name": "县医院", "level": "基层", "phone": "120",
     "note": "仅基础处置与转诊"},
    {"city": "张掖", "altitude_m": 1483, "name": "张掖市人民医院 / 河西学院附属张掖人民医院", "level": "三甲级",
     "phone": "120；旅游救援 0936-8211119", "note": "D3 落脚点，低海拔，医疗可靠"},
    {"city": "嘉峪关", "altitude_m": 1700, "name": "酒钢医院（嘉峪关市第一人民医院）", "level": "三甲",
     "phone": "120", "note": "D4 途经"},
    {"city": "敦煌", "altitude_m": 1139, "name": "敦煌市医院", "level": "二甲级",
     "phone": "急诊 0937-8859120（第三方数据，建议二次确认）", "note": "大病需转酒泉/兰州"},
    {"city": "阿克塞 / 大柴旦", "altitude_m": 3173, "name": "县/镇卫生院", "level": "基层，可吸氧",
     "phone": "120", "note": "医疗最薄弱的一段，重症只能下撤"},
    {"city": "格尔木", "altitude_m": 2800, "name": "格尔木市人民医院", "level": "三级乙等；设心血管高原病科、呼吸科、高压氧科",
     "phone": "0979-8496722（第三方数据，建议二次确认）", "note": "柴达木盆地最重要医疗支点，D7-D8 的安全靠山"},
    {"city": "德令哈", "altitude_m": 2980, "name": "海西州第二人民医院 / 德令哈市医院", "level": "基层-二级",
     "phone": "120", "note": "重症转格尔木或西宁"},
    {"city": "茶卡 / 共和", "altitude_m": 3059, "name": "乡镇卫生院 / 共和县医院", "level": "基层",
     "phone": "120", "note": "距西宁 2-3 小时，重症直接东送西宁"},
]

HEALTH = {
    "altitude_sickness": {
        "spo2_thresholds": [
            {"range": "≥95%", "judge": "正常", "action": "正常活动"},
            {"range": "90-94%", "judge": "高原常见值，可接受但需观察", "action": "减少活动强度、多喝水、慢慢走"},
            {"range": "<90%", "judge": "需要干预", "action": "立即休息 + 吸氧，停止一切体力活动"},
            {"range": "<85%", "judge": "危险", "action": "立即下撤海拔 + 就医，不要『再看看』"},
        ],
        "levels": [
            {"level": "轻度", "symptom": "头痛、乏力、轻微气短", "action": "休息、吸氧 15 分钟、补葡萄糖"},
            {"level": "中度", "symptom": "持续头痛、恶心呕吐、睡不着", "action": "吸氧 + 布洛芬 + 下撤 ≥500m"},
            {"level": "重度", "symptom": "意识模糊、咳粉红色泡沫痰、严重呼吸困难", "action": "立即下撤至 2500m 以下 + 呼叫 120"},
        ],
        "red_line_days": {
            "D6（9.30 敦煌1139m→大柴旦3170m）": [
                "敦煌出发前补葡萄糖；当金山不要奔跑",
                "抵大柴旦先休息、测血氧；不喝酒、不洗澡、早睡",
            ],
            "D8（10.2 昆仑山口 4767m）": [
                "任何人血氧 <90% 不上山",
                "昆仑山口停留上限 20-30 分钟",
                "出现头痛立刻回撤，不要再往瑶池（4300m）走",
            ],
        },
        "taboos": ["抵高原前两天不洗澡、不饮酒", "不剧烈运动、不奔跑跳跃", "感冒发烧不上高原", "老人小孩与心肺基础病者行前门诊评估"],
        "why_reverse_is_safer": [
            "前 5 天多在 2800m 以下，D4-D5 敦煌 1139m 是恢复窗口",
            "昆仑山 4767m 尝试发生在适应约 7 天之后",
        ],
    },
    "medicines": MEDICINES,
    "hospitals": HOSPITALS,
    "emergency_rules": [
        "120 全国通用；无信号时用北斗卫星短信求助",
        "报位置要报里程碑或最近地标名 + 方向，不要只说『在戈壁』",
        "出发前把 4 人的过敏史、慢性病、常用药写在手机备忘录 + 一张纸放钱包",
        "备好医保卡/电子医保凭证",
    ],
}

WEATHER = [
    {"city": "西宁", "altitude_m": 2261, "day_temp": "16-20℃", "night_temp": "4-8℃", "diff": "约12℃",
     "sunrise": "07:15-07:25", "sunset": "19:00-19:10", "risk": "早晚凉，市区无特殊风险"},
    {"city": "门源 / 祁连", "altitude_m": 2787, "day_temp": "12-16℃", "night_temp": "0-4℃", "diff": "约14℃",
     "sunrise": "", "sunset": "", "risk": "山区降雪与暗冰；9 月底-10 月可能封路"},
    {"city": "张掖", "altitude_m": 1483, "day_temp": "18-22℃", "night_temp": "5-9℃", "diff": "约13℃",
     "sunrise": "约07:30", "sunset": "约19:15", "risk": "大风沙尘（doc1 口径约 30%）"},
    {"city": "嘉峪关", "altitude_m": 1700, "day_temp": "17-21℃", "night_temp": "4-8℃", "diff": "约13℃",
     "sunrise": "约07:30", "sunset": "约19:15", "risk": "戈壁横风"},
    {"city": "敦煌", "altitude_m": 1139, "day_temp": "约20℃", "night_temp": "约5℃", "diff": "约15℃",
     "sunrise": "07:35-07:45", "sunset": "19:20-19:30", "risk": "大风沙尘可能致鸣沙山限流/关闭；降水极少"},
    {"city": "阿克塞 / 当金山口", "altitude_m": 3648, "day_temp": "8-14℃", "night_temp": "-3-2℃", "diff": "约13℃",
     "sunrise": "", "sunset": "", "risk": "垭口大风降温 + 可能降雪；G215 水毁应急通行"},
    {"city": "大柴旦", "altitude_m": 3173, "day_temp": "10-15℃", "night_temp": "-5-0℃", "diff": "约16℃",
     "sunrise": "07:45-07:55", "sunset": "19:20-19:30", "risk": "柴达木沙尘暴（doc1 口径约 25%）；首个高海拔住宿夜"},
    {"city": "格尔木", "altitude_m": 2800, "day_temp": "约14℃", "night_temp": "约0℃", "diff": "约14℃",
     "sunrise": "07:45-07:55", "sunset": "19:20-19:30", "risk": "昼夜温差大；沙尘"},
    {"city": "昆仑山口", "altitude_m": 4767, "day_temp": "-2-6℃", "night_temp": "-10℃ 以下", "diff": "大",
     "sunrise": "", "sunset": "", "risk": "可能降雪封路（doc1 口径暴雪约 10%）；体感因大风远低于气温"},
    {"city": "德令哈", "altitude_m": 2980, "day_temp": "12-17℃", "night_temp": "-2-3℃", "diff": "约15℃",
     "sunrise": "约07:40", "sunset": "约19:20", "risk": "戈壁大风"},
    {"city": "茶卡", "altitude_m": 3059, "day_temp": "10-15℃", "night_temp": "-3-2℃", "diff": "约15℃",
     "sunrise": "07:25-07:35", "sunset": "19:05-19:15", "risk": "阴天/大风则镜面不成立，可放弃"},
    {"city": "青海湖（黑马河/二郎剑）", "altitude_m": 3196, "day_temp": "10-15℃", "night_temp": "-4-1℃", "diff": "约15℃",
     "sunrise": "07:25-07:35", "sunset": "19:05-19:15", "risk": "湖边风大体感更冷；环湖测速极严"},
    {"city": "兰州", "altitude_m": 1520, "day_temp": "", "night_temp": "", "diff": "",
     "sunrise": "", "sunset": "", "risk": "D11-D12 城市段，无高原风险"},
]

DRIVING = {
    "fuel_stops": [
        {"no": 1, "node": "西宁", "day": "D1/D2 出发", "level": "必须", "next_risk": "西宁→达坂山→门源→祁连，沿线县城有站", "note": "市区油价与油品最正常，顺便加满玻璃水"},
        {"no": 2, "node": "祁连县城", "day": "D3 出发", "level": "必须", "next_risk": "祁连→9号公路→二尕→肃南，山区 150km+ 少站", "note": "出发前必满"},
        {"no": 3, "node": "肃南县城", "day": "D3 途中", "level": "建议补满", "next_risk": "肃南→张掖约 70km，风险低", "note": "doc2 原计划在肃南停 20min 补给"},
        {"no": 4, "node": "张掖", "day": "D4 出发", "level": "必须", "next_risk": "张掖→嘉峪关约 230km，正常分布", "note": "全天 580km 最长日，早出发"},
        {"no": 5, "node": "嘉峪关 / 酒泉", "day": "D4 午间", "level": "最高级", "next_risk": "嘉峪关→敦煌约 390km，瓜州可补", "note": "高速服务区油价略高但省心"},
        {"no": 6, "node": "敦煌", "day": "D6 出发", "level": "最高级", "next_risk": "敦煌→阿克塞→当金山→大柴旦约 380-500km，站极少", "note": "doc1 原文：极少！敦煌出发前加满"},
        {"no": 7, "node": "阿克塞县城", "day": "D6 途中", "level": "有站就补", "next_risk": "翻当金山前最后一个正常补给点", "note": "同时补水、上厕所、检查胎压"},
        {"no": 8, "node": "大柴旦", "day": "D7 出发", "level": "最高级", "next_risk": "大柴旦→水上雅丹→U型公路→格尔木 全段无站", "note": "doc2：加油只在大柴旦/格尔木"},
        {"no": 9, "node": "格尔木", "day": "D8/D9 出发", "level": "必须", "next_risk": "D8 昆仑山口往返 400km 无补给；D9 察尔汗+德令哈 270km", "note": "doc2：格尔木出发前加满油"},
        {"no": 10, "node": "德令哈", "day": "D10 出发", "level": "必须", "next_risk": "德令哈→茶卡约 200km，途中站稀", "note": "doc1：德令哈务必加满"},
        {"no": 11, "node": "茶卡 / 共和", "day": "D10 途中", "level": "建议", "next_risk": "环湖段→西宁约 240km，站较多", "note": "还车前按合同把油加回约定刻度"},
    ],
    "fuel_rules": [
        "上表节点出发前一律加满，不看油量表还剩多少",
        "戈壁段油量低于 1/2 就地补，不要赌下一个站",
        "把『两次加满之间』的最大跨度按 300km 规划，抵达下一节点时仍应有 ≥1/4",
        "主要城镇 92/95 号供应充足；备用油桶受租车与法规限制，不要依赖",
    ],
    "signal_deadzones": [
        {"segment": "西宁→达坂山→门源→仙米→祁连", "km": 420, "level": "一般", "detail": "县城与主干道基本 4G；达坂山垭口、仙米林区谷地间断"},
        {"segment": "祁连→9号公路→二尕公路→肃南", "km": 280, "level": "较差", "detail": "山区多段无信号，隧道与背坡侧尤甚（祁连山垭口覆盖率不足 30%）"},
        {"segment": "张掖→嘉峪关→瓜州→敦煌（G30/G3011）", "km": 580, "level": "良好", "detail": "高速全程基本有信号"},
        {"segment": "敦煌→阿克塞→当金山→大柴旦（G215/S305）", "km": 500, "level": "差", "detail": "当金山盘山段、黑独山土路段弱/无信号"},
        {"segment": "大柴旦→水上雅丹→U型公路→格尔木（G315）", "km": 500, "level": "最差（全程最危险）", "detail": "大部分路段信号极弱或完全无服务"},
        {"segment": "东台/西台吉乃尔湖一带（若加点）", "km": 300, "level": "极差", "detail": "移动与联通覆盖极差，部分地段完全无信号"},
        {"segment": "格尔木→昆仑山口→瑶池（G109 往返）", "km": 400, "level": "断续", "detail": "昆仑山口有零星覆盖但不稳定"},
        {"segment": "格尔木→察尔汗→德令哈（G3011/G315）", "km": 270, "level": "一般", "detail": "盐湖景区与高速沿线尚可，中段间断"},
        {"segment": "德令哈→茶卡→青海湖→西宁（G315/G109）", "km": 500, "level": "良好", "detail": "基本有信号；环湖段良好"},
    ],
    "signal_countermeasures": [
        "运营商实测量级：移动有效覆盖约 40%，联通无信号率 53%，电信无信号率 62%（单一来源，仅作量级参考）",
        "车上至少 2 个不同运营商号码，最好含 1 个移动号，开启双卡/热点共享",
        "出发前下载高德 + 百度离线地图（青海 + 甘肃全省）",
        "至少 1 人开通北斗卫星短信并实测发一条",
        "D7 出发前约定失联规则：每到一个点位发一次位置，超 3 小时未更新视为异常",
    ],
    "speed_limits": [
        {"segment": "青海湖环湖 G109 / 倒湖茶公路（倒淌河–江西沟–黑马河）", "limit": "全线 80km/h，村镇/岔口降至 60 甚至 40",
         "enforcement": "单点 + 区间，测速点多", "strictness": "极严", "note": "doc2 点名『尤其江西沟–黑马河』"},
        {"segment": "G109 湖东/共和方向部分区段", "limit": "存在 60km/h 双向抓拍区间", "enforcement": "区间抓拍",
         "strictness": "严", "note": "1994K+400–1998K+650 等，约 3.5-4.25km"},
        {"segment": "G109 共和段固定测速", "limit": "小型汽车 80km/h", "enforcement": "单点双向", "strictness": "严",
         "note": "2029KM+550、2045KM+300 等点位（2024 年通告，需复查新增）"},
        {"segment": "G315 U型公路（格尔木段 766/780 里程碑一带）", "limit": "限速 80，严禁路面停车/占道拍照",
         "enforcement": "区间测速 + 违停抓拍 + 交警巡逻", "strictness": "极严", "note": "罚 200 元 + 记 3 分；沿线约 18 处警示牌、8 处违停抓拍、4 处区间测速"},
        {"segment": "当金山盘山段（G215）", "limit": "40-60km/h", "enforcement": "定点 + 移动", "strictness": "严",
         "note": "翻过山后戈壁『路太好』最易超速"},
        {"segment": "祁连 9 号公路 / 二尕公路（G213）", "limit": "山区弯道 40-60，村镇更低", "enforcement": "定点 + 移动",
         "strictness": "严", "note": "重点是弯道会车安全而非罚单"},
        {"segment": "G30 连霍高速（张掖→嘉峪关→瓜州）", "limit": "100-120，施工段降至 60-80", "enforcement": "区间测速密集",
         "strictness": "中", "note": "施工段限速变化频繁"},
        {"segment": "G109 格尔木→昆仑山口", "limit": "60-80，弯坡与冻土段更低", "enforcement": "定点", "strictness": "中", "note": ""},
        {"segment": "察格段高速（察尔汗–格尔木）", "limit": "施工期超车道封闭，行车道正常", "enforcement": "—",
         "strictness": "注意变道", "note": "施工至 2026-09-30，遇恶劣天气顺延"},
    ],
    "violation_traps": [
        "区间测速看平均速度：全程匀速略低于限速，不要前段超速后段龟服，也不要提前到终点",
        "占道停车拍照（U型公路、G315 直道、黑独山路边、环湖西路）——只在正规观景台停",
        "限速骤变：戈壁 100 → 进村镇 40 是常态，导航测速提醒全程开",
        "实线变道/弯道超车是本线最高致死风险，山路窄注意会车",
    ],
    "road_risks": [
        {"name": "G227 峨堡–扁都口段", "status": "全幅封闭",
         "detail": "扁都口→峨堡 K93+205—K129+000 封闭至 2027-09-30；峨堡→景阳岭 K129+000—K143+500 封闭至 2027-07-31",
         "impact": "doc2 的『D3 雨雪改走扁都口』备选失效；官方绕行 = 本方案 D3 路线（G0611+S302+G213 9号公路）",
         "action": "D3 遇雨雪只能祁连多住一晚或走 G0611 高速大绕行"},
        {"name": "当金山 G215 K628–K670", "status": "水毁后仅应急通行，限时限向限速",
         "detail": "2026-08-12 起开放应急通行 09:00-20:00；08-16 补充：仅允许『青海→阿克塞』方向小型车单向通行，限速 30km/h",
         "impact": "本次 D6 是敦煌/阿克塞→青海方向，正是通告里需绕行高速的方向",
         "action": "若仍维持管制，D6 改走 G3011 柳格高速；黑独山挪到 D7 早晨从大柴旦侧往返"},
        {"name": "祁连山 9 号公路（G213 肃祁路）", "status": "2026-07-30 滑坡封闭，08-04 解除",
         "detail": "全长约 153km，铺装良好，被称『青海的独库公路』；落石与暗冰风险常在",
         "impact": "9 月底已过主汛期，通行概率高", "action": "出发前 3 天查张掖市公安局通告与「天境祁连」公众号"},
        {"name": "二尕公路", "status": "未查到 2026 现行封闭通告，但区段定义与铺装情况冲突",
         "detail": "口径A：部分非铺装约 105km；口径B：全线 400km 含近 100km 碎石搓板路，仅建议硬派越野",
         "impact": "本次是家用 SUV + 4 人 + 国庆时间紧",
         "action": "以 G213 祁连 9 号公路为主线，二尕仅作观景片段；出现非铺装碎石路即退回主线"},
        {"name": "高海拔垭口降雪", "status": "季节性风险",
         "detail": "昆仑山口 4767m（D8）、当金山口 3648m（D6）、景阳岭 3767m、达坂山 3940m（D2）、大冬树山 4120m（加点）",
         "impact": "doc1 口径：暴雪（青海山口段）约 10%、柴达木沙尘暴约 25%、大风沙尘（敦煌/嘉峪关）约 30%",
         "action": "封路或降雪直接放弃当日往返；下坡用发动机制动"},
        {"name": "施工与拥堵点（2026-08 时点）", "status": "需二次确认",
         "detail": "察格段 K766+500 超车道封闭至 2026-09-30；G30 永山段半幅通行；德令哈东至怀头他拉 G315 半幅放行等 15-20 分钟；大柴旦→水上雅丹有口径称含约 5km 砂石路",
         "impact": "影响单日通过时间", "action": "每天早晨发车前查青海省交通运输厅路况与「青海交通」公众号"},
    ],
    "assisted_driving": {
        "best": "D4 G30 连霍高速（张掖→嘉峪关→瓜州→敦煌）长直线段",
        "forbidden": ["祁连山路/达坂山盘山段", "G315 U型公路", "昆仑山 G109 冻土段", "景区内道路与非铺装路"],
        "note": "至少 2 名司机，D4/D6/D7 每 2 小时或 150-200km 换手一次",
    },
    "breakdown_flow": [
        "双闪 + 三角警示牌（高速 150m 外，国道 50-100m）",
        "人员撤离到护栏外/上风侧，不要留在车内",
        "报警时说清里程碑或最近地标 + 方向 + 车型车牌",
        "无信号时用北斗卫星短信；车内常备三角牌、搭电线、充气泵、拖车绳、手电、毛毯、≥3 天水粮",
    ],
    "rental": {
        "pickup": "曹家堡机场门店取车（预留 60-90 分钟）",
        "dropoff": "西宁市区还车（D10 晚），注意异地/异店费",
        "insurance": "不计免赔 + 轮胎险 +（可选）玻璃/底盘",
        "checklist": "绕车拍视频（四角/四轮侧壁/挡风/车顶/前唇底盘）、拍内饰后备箱、拍里程与油量、确认备胎与工具、索要保险条款、存 24h 救援电话、确认里程限制",
        "book_ahead": "至少提前 1 个月",
    },
}

EMERGENCY_CONTACTS = [
    {"name": "全国急救", "phone": "120"},
    {"name": "全国报警", "phone": "110"},
    {"name": "交通事故报警", "phone": "122"},
    {"name": "全国道路救援（交警）", "phone": "12122"},
    {"name": "青海高速救援", "phone": "96122"},
    {"name": "甘肃高速救援", "phone": "96122"},
    {"name": "政务/旅游投诉", "phone": "12345"},
    {"name": "市场监管（消费纠纷）", "phone": "12315"},
    {"name": "文旅投诉", "phone": "12301"},
    {"name": "敦煌旅游投诉", "phone": "0937-8883000"},
    {"name": "敦煌市医院急诊", "phone": "0937-8859120（第三方数据，建议二次确认）"},
    {"name": "张掖旅游救援", "phone": "0936-8211119"},
    {"name": "格尔木市人民医院（含高压氧科）", "phone": "0979-8496722（第三方数据，建议二次确认）"},
    {"name": "中国海拔救援协会", "phone": "400-820-0110"},
    {"name": "阿克塞县交管大队（当金山管制咨询）", "phone": "0937 开头 24 小时值班电话，号码以最新通告为准"},
    {"name": "租车公司 24h 救援", "phone": "取车时索取并存入手机 + 抄写纸质卡片"},
    {"name": "保险公司报案", "phone": "车险保单上 95 开头电话（取车时拍照保单）"},
]

CHECKLIST = {
    "one_week_before": [
        "开始服用红景天（4 人同步，9.18 起）",
        "确认租车订单：车型、机场取车点、西宁市区还车点、异地费、里程限制",
        "确认保险：不计免赔 + 轮胎险 +（可选）玻璃/底盘",
        "确认全部住宿 11 晚，重点复查敦煌 2 晚 + 大柴旦 1 晚",
        "莫高窟票已到手（A 票或 B 票方案已定）",
        "其他门票预约：七彩丹霞、鸣沙山、茶卡、水上雅丹、察尔汗等按需",
        "下载高德 + 百度离线地图（青海 + 甘肃全省）",
        "开通北斗卫星短信（≥1 人）并实测发一条",
        "无人机实名登记完成并截图（莫高窟禁飞、察尔汗需报备）",
        "买齐医疗包：血氧仪、葡萄糖、布洛芬、感冒药、肠胃药、晕车药",
        "买齐装备：防水鞋套 ×4、偏振镜、充电宝、三脚架、保温杯",
        "打包衣物：三层法 + 羽绒 + 帽子手套 + 防晒全套",
        "查一次路况：当金山 G215、9 号公路、G109 昆仑山口、二尕公路",
        "关注公众号：青海交通、青海交警、云上酒泉、天境祁连、莫高窟参观预约",
        "体检/慢病评估（如有老人或基础病者）",
        "分工确认：谁记账、谁导航、谁订餐、2 名司机换手规则",
    ],
    "one_day_before": [
        "身份证 + 驾驶证正本装包（doc2 Checklist 第一条）",
        "取现金零钞 500-1000 元（含 1 元零钞）",
        "手机存离线票凭证 + 酒店确认单 + 行程单，并打印一份",
        "手机存救援/医院/租车/同行电话，并抄一份纸质卡片",
        "充满手机、充电宝、相机电池 ×3、无人机电池",
        "再查一次天气与路况（重点 9.30 当金山、10.2 昆仑山口）",
        "确认航班/高铁时刻与机场接送安排",
        "药品分装：随身小包（葡萄糖、布洛芬、唇膏）+ 行李大包",
        "行李按『三个圈层』打包，垭口包（羽绒帽子手套）单独放",
        "早睡，保证 7-8 小时",
    ],
    "departure_day": [
        "落地取车按 60-90 分钟预留（中秋首日 + 国庆前，柜台繁忙）",
        "取车 7 件事：绕车拍视频、拍内饰后备箱、拍里程与油量、确认备胎与工具、索要保险条款、存救援电话、确认里程限制",
        "确认车带 ACC + 车道保持，在市区先试一遍开关",
        "西宁药店买 4-6 罐氧气瓶（20-30 元/罐）",
        "超市补货：水（≥3 天量）、干粮、纸巾、水果",
        "加满油 + 加玻璃水",
        "手机装好支架、导航测速提醒打开",
    ],
    "every_morning_60s": [
        "油量满", "胎压正常", "当日路况已查", "离线地图可用",
        "水粮氧气在车", "换手司机已定", "现金零钞在身", "08:00 前发车",
    ],
}

PITFALLS = [
    {"category": "方向与错峰", "item": "逆时针整体更少人，但『早出发、赶早到景点』比方向更重要；莫高窟别卡 10.1", "source": "doc2 避雷清单第1条"},
    {"category": "限速与测速", "item": "青海湖环湖 G109（尤其江西沟–黑马河）严；G315 U型公路限速 80 严禁停车；当金山盘山 40-60；区间测速看平均速度", "source": "doc2 第2条"},
    {"category": "加油/信号/现金", "item": "柴达木无人区两站可隔 150km+，格尔木、大柴旦见站就加满；下离线地图；备现金及 1 元零钞（观光车、旱厕、部分加油站只收现金）", "source": "doc2 第3条"},
    {"category": "天气与穿衣", "item": "昼夜温差 20℃+，洋葱式穿衣；9 月底-10 月祁连、昆仑山口、当金山垭口可能降雪封路；关注「青海交通」预警", "source": "doc2 第4条"},
    {"category": "高原反应", "item": "青海段垭口最高约 3800m，昆仑山口 4767m；提前一周红景天、带葡萄糖/血氧仪/氧气瓶；抵高原别剧烈运动、多喝水、前两天别洗澡喝酒", "source": "doc2 第5条"},
    {"category": "景点避雷", "item": "U型公路噱头大于观赏；阿克塞石油小镇/大地之子人造景性价比低可略；东台吉乃尔湖曾发关闭/干涸通告；察尔汗最晒；茶卡依赖天气、穿鞋套、停官方场；青海湖环湖西路别私闯牧民点；鸣沙山持票 3 天；七彩丹霞下午/雨后最美别踩地貌", "source": "doc2 第6条"},
    {"category": "消费与风俗", "item": "不买景区兜售玉石珠宝（多假货）；民族披肩比价 3 家；称重菜先问单价；景区 3km 内餐馆贵，往本地巷子找；不搭黑车；氧气瓶去正规药店买", "source": "doc2 第7条"},
    {"category": "车辆与驾驶", "item": "4 人 + 行李建议 SUV、租油车更省心、出发前做保养（重点轮胎刹车）；至少 2 名司机换开；大货车并线不打灯常见，保持车距；戈壁横风注意侧偏", "source": "doc2 第8条"},
    {"category": "必带装备", "item": "SPF50+ 防晒霜、墨镜、遮阳帽、袖套；润唇膏、身体乳、芦荟胶；防水鞋套、口罩、充电宝、现金、常用药、保温杯；无人机可选（莫高窟禁飞、察尔汗需报备）", "source": "doc2 第9条"},
    {"category": "消费坑·玉石珠宝", "item": "『厂家直销店』讲故事高价卖低值品，退货极难 —— 一律不买", "source": "08 册 §6"},
    {"category": "消费坑·氧气瓶", "item": "景区门口 50-80 元/罐，西宁药店 20-30 元/罐", "source": "08 册 §6"},
    {"category": "消费坑·拍照收费", "item": "牵牦牛/藏獒/穿民族服装合影先说随便拍，拍完要钱 —— 拍前问清价格或不拍", "source": "08 册 §6"},
    {"category": "消费坑·酒店加价", "item": "旺季到店加价或单方取消高发 —— 保存订单截图与聊天记录，投诉 12345/12315/12301", "source": "08 册 §6"},
    {"category": "民族风俗", "item": "尊重回/藏习俗（藏民多不吃鱼，尤其湟鱼）；拍当地人先征得同意；进寺庙着装得体、不逆时针转经筒、严禁拍佛像", "source": "08 册 §7 + 03 册塔尔寺"},
]

BUDGET = {
    "currency": "CNY",
    "scope": "4 人 / 12 天 / 逆时针主方案（自驾 3580km + 兰州送机 75km）",
    "doc1_three_tiers": {
        "note": "doc1 原表为 11 天 / 2 人 / 五一 / 2466km 口径，仅作分档结构参考；原文表头与表内合计自相矛盾，两个数均保留",
        "预算型": {"headline": "约14250元（人均7125元）", "table_total": "约10465元（建议备用14000+元）",
                 "items": {"租车": 2750, "汽油": 1665, "高速": 300, "门票": 2500, "住宿": 1650, "餐饮": 1100, "其他": 500}},
        "中档": {"headline": "约19700元（人均9850元）", "table_total": "约15725元（建议备用20000元）",
               "items": {"租车": 4180, "汽油": 1665, "高速": 300, "门票": 3500, "住宿": 3300, "餐饮": 1980, "其他": 800}},
        "品质型": {"headline": "约26100元（人均13050元）", "table_total": "约25695元（建议备用26000+元）",
                 "items": {"租车": 7150, "汽油": 1665, "高速": 300, "门票": 4500, "住宿": 7500, "餐饮": 3080, "其他": 1500}},
    },
    "this_trip_4people": {
        "items": [
            {"item": "租车（12 天）", "basis": "燃油 SUV 250-380 元/天，国庆上浮 30-60%", "low": 3000, "high": 7300},
            {"item": "油费", "basis": "3655km，8-9L/100km，7.5 元/L；doc3 实测约 2000 元", "low": 2000, "high": 2500},
            {"item": "过路费", "basis": "doc3 导航推荐 745 元；若 10.1-10.7 免费则仅 9.25-9.30 收费", "low": 300, "high": 750},
            {"item": "住宿（11 晚 × 2 间）", "basis": "单间 2908-3147 ×2；国庆上浮 30-50%", "low": 5816, "high": 9400},
            {"item": "餐饮（12 天 × 4 人）", "basis": "人均 100-180 元/天", "low": 4800, "high": 8640},
            {"item": "门票（4 人）", "basis": "实付价核心景点约 760 元/人（含莫高窟 A 票 238）", "low": 3040, "high": 3800},
            {"item": "其他", "basis": "停车、氧气瓶、鞋套、纪念品、洗车、妆造", "low": 1200, "high": 3000},
        ],
        "subtotal_excl_flight": {"low": 20156, "high": 35390},
        "per_person_excl_flight": {"low": 5040, "high": 8850},
        "train_xining_lanzhou": {"low": 240, "high": 240, "basis": "60 元/人 ×4"},
        "flight_shanghai_estimate": {"low": 7200, "high": 14000, "basis": "1800-3500 元/人 ×4（自估）"},
        "total_incl_flight": {"low": 27600, "high": 49600},
        "per_person_incl_flight": {"low": 6900, "high": 12400},
        "recommendation": "按人均 8000-9000 元准备，总预算备至 36000 元；与 doc3 实走人均约 7000 元交叉验证吻合",
    },
    "accommodation": {
        "single_room_11_nights": "2908-3147 元",
        "two_rooms_11_nights": "5816-6294 元",
        "holiday_buffer_07": "7600-9400 元（07 册口径）",
        "holiday_reality_08": "11000-22000 元（08 册更保守的国庆现实口径）",
        "note": "敦煌 2 晚 ¥179 的价格在国庆几乎不可能维持，必须重新核价",
    },
    "tickets": {"per_person_core": "976-1046 元（文档价）/ 约 760 元（实付价口径）",
                "four_people": "3904-4184 元",
                "saving": "放弃茶卡与部分加点可降到约 800 元/人"},
    "money_tips": [
        "4 人分摊车费是最大的省钱杠杆",
        "格尔木连住 2 晚 ¥179 是全程最省的两晚，不要换",
        "国庆高速免费段能省约 400-700 元（需二次确认时段）",
        "鸣沙山 110 元票 3 天多次入，敦煌住 2 晚可用满",
        "七彩丹霞次日二次入园仅需 20 元车票（首次入园时告知并录指纹）",
        "别在敦煌酒店上省；别买景区鞋套（20 一双 vs 外面 15 两双）",
    ],
}

RESERVATIONS = [
    {"item": "莫高窟 A 票", "channel": "『莫高窟参观预约网』官方小程序/公众号",
     "ahead": "doc2：9.24 零点抢票；另一口径：提前 1 个月 07:00 放票 —— 两个闹钟都设", "priority": "最高"},
    {"item": "敦煌 2 晚 + 大柴旦 1 晚住宿", "channel": "携程/美团/飞猪，优先免费取消",
     "ahead": "立即预订（国庆最紧）", "priority": "最高"},
    {"item": "租车", "channel": "一嗨/神州/携程租车等正规平台", "ahead": "至少提前 1 个月", "priority": "高"},
    {"item": "七彩丹霞 / 鸣沙山 / 茶卡 / 水上雅丹 / 察尔汗", "channel": "各景区官方小程序",
     "ahead": "提前 1-3 天实名预约", "priority": "中"},
    {"item": "塔尔寺", "channel": "『塔尔寺』官方公众号", "ahead": "提前实名预约", "priority": "可选"},
    {"item": "西宁→兰州高铁（D11）", "channel": "12306", "ahead": "提前 15 天开售即买，约 60 元/人", "priority": "高"},
]


# ----------------------------------------------------------------------
# 4. 海拔剖面（解析 00 册 §4 表格）
# ----------------------------------------------------------------------

def build_altitude_profile():
    rows = table_rows(os.path.join(KB, BOOKS[0][1]), "## 4. 全程海拔剖面表", ncol=4)
    out = []
    for c in rows:
        if c[0] in ("海拔",) or "---" in c[0]:
            continue
        raw = c[0]
        digits = re.findall(r"(\d[\d,]*)", raw.replace("，", ","))
        alt = int(digits[0].replace(",", "")) if digits else None
        out.append({
            "point": c[1],
            "altitude_m": alt,
            "altitude_raw": raw,
            "day_or_position": c[2],
            "source": c[3],
        })
    out.sort(key=lambda x: (x["altitude_m"] is None, x["altitude_m"]))
    return out


# ----------------------------------------------------------------------
# 5. 导出：合并 Markdown
# ----------------------------------------------------------------------

MERGED_NAME = "青甘大环线知识库_全文合并.md"

ITIN_COLUMNS = ["day", "date", "weekday", "theme", "route", "distance_km", "drive_hours",
                "play_hours", "spots", "spot_count", "tickets", "altitude_points", "meals",
                "hotel", "hotel_price_cny", "fuel_stop", "signal_risk", "notes_count", "key_notes"]

POI_COLUMNS = ["name", "aliases", "region", "category", "is_niche", "ticket_cny", "shuttle_cny",
               "altitude_m", "visit_hours", "best_time", "road_requirement", "signal", "rating",
               "recommendation", "suggested_day", "detour_note", "ref_url"]


def read_book(fn):
    with open(os.path.join(KB, fn), encoding="utf-8") as f:
        return f.read()


def book_line_count(text):
    return len(text.split("\n"))


def build_merged_md():
    books = [(no, fn, desc, read_book(fn)) for no, fn, desc in BOOKS]
    total_lines = sum(book_line_count(t) for _, _, _, t in books)

    head = []
    head.append("# 2026 国庆青甘大环线 · 逆时针 12 天自驾知识库（全文合并版）")
    head.append("")
    head.append("> **用途**：本文件把 00—08 共 9 册知识库按顺序合并为一个文件，"
                "供一次性投喂给大模型（ChatGPT / Claude / 豆包 / Kimi 等）后再提问。")
    head.append("> **行程**：2026-09-25 — 2026-10-06，12 天，4 名成人，SUV 自驾，逆时针方向，"
                "自驾约 3,580 km（含兰州送机约 3,655 km）。")
    head.append("> **生成时间基准**：知识库 last_verified = %s。"
                "价格 / 路况 / 假期政策 / 门票时间均需出行前 3 天二次确认。" % META["last_verified"])
    head.append("")
    head.append("## 总目录（各册行数与用途）")
    head.append("")
    head.append("| 分册 | 文件 | 行数 | 一句话用途 |")
    head.append("|---|---|---|---|")
    for no, fn, desc, text in books:
        head.append("| 【分册%s】 | `%s` | %d | %s |" % (no, fn, book_line_count(text), desc))
    head.append("| **合计** | 9 册 | **%d** | — |" % total_lines)
    head.append("")
    head.append("## 阅读顺序建议")
    head.append("")
    head.append("1. 先看 **分册00**（方向与总里程决策）与 **分册01**（逐日主方案）——这两册决定行程骨架；")
    head.append("2. 需要取舍景点时查 **分册03 / 04**（景点档案）与 **分册02**（变体与加点）；")
    head.append("3. 出发前逐条执行 **分册05**（路况/加油/信号/限速）、**分册06**（高原健康/天气/装备）、"
                "**分册07**（住宿/餐饮/预算/票务）、**分册08**（错峰/避坑/Checklist/应急）。")
    head.append("")
    head.append("## 三条硬约束（贯穿全知识库）")
    head.append("")
    head.append("- **每天 08:00 前发车**：10 月初西部日落 19:10—19:30，可用光照仅约 11.5 小时；最晚 18:00 前到店。")
    head.append("- **加油只认节点不认油量表**：敦煌、大柴旦、格尔木出发必须 100% 满油；无补给跨度按 300 km 规划。")
    head.append("- **高原红线**：血氧 <90% 休息吸氧，<85% 立即下撤就医；D6 大柴旦夜与 D8 昆仑山口是两个风险峰值。")
    head.append("")
    head.append("## 时效性提示：出行前必须二次确认的三处冲突")
    head.append("")
    for i, c in enumerate(OPEN_CONFLICTS, 1):
        head.append("%d. %s" % (i, c))

    parts = ["\n".join(head)]
    for no, fn, desc, text in books:
        title = os.path.splitext(fn)[0]
        parts.append("\n\n---\n\n# 【分册%s】%s\n\n%s" % (no, title, text))

    merged = "".join(parts)
    path = os.path.join(OUT, MERGED_NAME)
    with open(path, "w", encoding="utf-8") as f:
        f.write(merged)
    return path, merged, total_lines


# ----------------------------------------------------------------------
# 6. 导出：itinerary_days.csv
# ----------------------------------------------------------------------

def csv_safe(value):
    """CSV 字段清洗：去掉逗号（半角与全角），压掉换行。"""
    if value is None:
        return ""
    s = str(value)
    s = s.replace("\n", " ").replace("\r", " ")
    s = s.replace(",", "、").replace("，", "、")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def itinerary_rows():
    rows = []
    for d in ITIN:
        rows.append({
            "day": d["day"],
            "date": d["date"],
            "weekday": d["weekday"],
            "theme": csv_safe(d["theme"]),
            "route": csv_safe(d["route"]),
            "distance_km": d["distance_km"],
            "drive_hours": d["drive_hours"],
            "play_hours": d["play_hours"],
            "spots": csv_safe(" | ".join(d["spots"])),
            "spot_count": len(d["spots"]),
            "tickets": csv_safe(d["tickets"]),
            "altitude_points": csv_safe(d["altitude_points"]),
            "meals": csv_safe(d["meals"]),
            "hotel": csv_safe(d["hotel"]),
            "hotel_price_cny": d["hotel_price_cny"] if d["hotel_price_cny"] else "",
            "fuel_stop": csv_safe(d["fuel_stop"]),
            "signal_risk": csv_safe(d["signal_risk"]),
            "notes_count": len(d["notes"]),
            "key_notes": csv_safe(" | ".join(d["key_notes"])),
        })
    return rows


def write_itinerary_csv():
    rows = itinerary_rows()
    path = os.path.join(OUT, "itinerary_days.csv")
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=ITIN_COLUMNS, quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(rows)
    return path, rows


# ----------------------------------------------------------------------
# 7. 导出：pois.csv
# ----------------------------------------------------------------------

def write_pois_csv(pois):
    path = os.path.join(OUT, "pois.csv")
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=POI_COLUMNS, quoting=csv.QUOTE_ALL,
                           extrasaction="ignore")
        w.writeheader()
        for p in pois:
            w.writerow({k: csv_safe(p.get(k, "")) if k not in ("is_niche",) else p.get(k, "")
                        for k in POI_COLUMNS})
    return path


# ----------------------------------------------------------------------
# 8. 导出：knowledge_base.json
# ----------------------------------------------------------------------

def build_hotels():
    hotels = []
    for d in ITIN:
        if not d["hotel"]:
            continue
        hotels.append({
            "day": d["day"],
            "date": d["date"],
            "city": d.get("hotel_city", ""),
            "name": d["hotel"],
            "price_cny": d["hotel_price_cny"] if d["hotel_price_cny"] else None,
            "alternative": d.get("hotel_alt", ""),
            "source": "07 册 §1.1 真实酒店名+价格总表（携程/飞书表 sheet 口径，单间价，国庆需重新核价）",
        })
    return hotels


def build_itinerary_json():
    out = []
    for d in ITIN:
        out.append({
            "day": d["day"],
            "date": d["date"],
            "weekday": d["weekday"],
            "theme": d["theme"],
            "route": d["route"],
            "distance_km": d["distance_km"],
            "drive_hours": d["drive_hours"],
            "play_hours": d["play_hours"],
            "altitude_points": d["altitude_points"],
            "tickets": d["tickets"],
            "meals": d["meals"],
            "fuel_stop": d["fuel_stop"],
            "signal_risk": d["signal_risk"],
            "timeline": d["timeline"],
            "spots": d["spots"],
            "optional_spots": d.get("optional", []),
            "notes": d["notes"],
            "key_notes": d["key_notes"],
            "hotel": {
                "name": d["hotel"],
                "city": d.get("hotel_city", ""),
                "price_cny": d["hotel_price_cny"] if d["hotel_price_cny"] else None,
                "alternative": d.get("hotel_alt", ""),
            },
            "stats": {
                "spot_count": len(d["spots"]),
                "note_count": len(d["notes"]),
                "distance_km": d["distance_km"],
            },
        })
    return out


def write_knowledge_json(pois):
    kb = {
        "meta": META,
        "route_decision": ROUTE_DECISION,
        "open_conflicts": OPEN_CONFLICTS,
        "altitude_profile": build_altitude_profile(),
        "itinerary": build_itinerary_json(),
        "pois": pois,
        "hotels": build_hotels(),
        "budget": BUDGET,
        "reservations": RESERVATIONS,
        "driving": DRIVING,
        "health": HEALTH,
        "weather": WEATHER,
        "checklist": CHECKLIST,
        "pitfalls": PITFALLS,
        "emergency_contacts": EMERGENCY_CONTACTS,
    }
    path = os.path.join(OUT, "knowledge_base.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(kb, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return path, kb


# ----------------------------------------------------------------------
# 9. 自检
# ----------------------------------------------------------------------

def file_lines(path):
    with open(path, encoding="utf-8-sig") as f:
        return len(f.read().split("\n"))


def verify(merged_path, merged_text, sum_book_lines, itin_path, poi_path, json_path, pois):
    ok = True
    print("=" * 68)
    print("自检结果")
    print("=" * 68)

    # 1. 合并 MD
    merged_lines = book_line_count(merged_text)
    header_lines = merged_lines - sum_book_lines
    print("[MD] %s" % os.path.basename(merged_path))
    print("     行数 = %d，九册原文合计 = %d，导出层新增（目录+分册标题）= %d"
          % (merged_lines, sum_book_lines, header_lines))
    if merged_lines < sum_book_lines:
        print("     ✗ 合并行数小于各册之和")
        ok = False
    elif header_lines > 120:
        print("     ✗ 新增行数异常（>120），可能重复插入内容")
        ok = False
    else:
        print("     ✓ 行数≈各册之和（差值仅为总目录与分册分隔标题）")
    missing = [fn for _, fn, _ in BOOKS if "# 【分册" not in merged_text or
               os.path.splitext(fn)[0] not in merged_text]
    if missing:
        print("     ✗ 缺少分册标题：%s" % missing)
        ok = False
    else:
        print("     ✓ 9 个分册标题齐全")

    # 2. itinerary CSV
    with open(itin_path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    print("[CSV] itinerary_days.csv")
    print("     总行数 = %d（含表头），数据行 = %d，列数 = %d"
          % (len(rows), len(rows) - 1, len(rows[0])))
    widths = {len(r) for r in rows}
    if len(widths) != 1 or len(rows[0]) != len(ITIN_COLUMNS):
        print("     ✗ 列数不一致：%s" % widths)
        ok = False
    else:
        print("     ✓ 每行列数一致 = %d，与规定列名完全一致" % len(ITIN_COLUMNS))
    if len(rows) - 1 != 12:
        print("     ✗ 数据行数应为 12（D1-D12）")
        ok = False
    else:
        print("     ✓ 12 天逐日行程齐全（D1=2026-09-25 … D12=2026-10-06）")
    bad_comma = [r[0] for r in rows[1:] if any("," in c for c in r)]
    if bad_comma:
        print("     ✗ 以下天的字段内出现逗号：%s" % bad_comma)
        ok = False
    else:
        print("     ✓ 字段内无逗号（已替换为、），全字段双引号包裹")
    total_km = sum(int(r[5]) for r in rows[1:])
    print("     自驾里程合计 = %d km" % total_km)

    # 3. pois CSV
    with open(poi_path, encoding="utf-8-sig", newline="") as f:
        prows = list(csv.reader(f))
    print("[CSV] pois.csv")
    print("     总行数 = %d（含表头），景点条数 = %d，列数 = %d"
          % (len(prows), len(prows) - 1, len(prows[0])))
    pwidths = {len(r) for r in prows}
    if len(pwidths) != 1 or len(prows[0]) != len(POI_COLUMNS):
        print("     ✗ 列数不一致：%s" % pwidths)
        ok = False
    else:
        print("     ✓ 每行列数一致 = %d，与规定列名完全一致" % len(POI_COLUMNS))
    if len(prows) - 1 < 70:
        print("     ✗ 景点条数少于 70")
        ok = False
    else:
        niche = sum(1 for p in pois if p["is_niche"] == 1)
        print("     ✓ 景点条数 = %d（干线核心 %d + 小众秘境 %d；is_niche=1 共 %d 条）"
              % (len(pois),
                 sum(1 for p in pois if p["source_book"].startswith("03")),
                 sum(1 for p in pois if p["source_book"].startswith("04")),
                 niche))
    dup = {p["name"] for p in pois if [x["name"] for x in pois].count(p["name"]) > 1}
    if dup:
        print("     ✗ 存在重名景点：%s" % dup)
        ok = False
    else:
        print("     ✓ 无重名景点")

    # 4. JSON
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)
    print("[JSON] knowledge_base.json")
    print("     行数 = %d，顶层键 %d 个：%s"
          % (file_lines(json_path), len(data), "、".join(data.keys())))
    required = ["meta", "route_decision", "altitude_profile", "itinerary", "pois", "hotels",
                "budget", "driving", "health", "weather", "checklist", "pitfalls",
                "emergency_contacts"]
    miss = [k for k in required if k not in data]
    if miss:
        print("     ✗ 缺少顶层键：%s" % miss)
        ok = False
    else:
        print("     ✓ json.load 解析通过，13 个必需顶层键齐全")
    print("     itinerary = %d 天，pois = %d 条，hotels = %d 晚，altitude_profile = %d 点，"
          "weather = %d 站，pitfalls = %d 条，emergency_contacts = %d 条"
          % (len(data["itinerary"]), len(data["pois"]), len(data["hotels"]),
             len(data["altitude_profile"]), len(data["weather"]), len(data["pitfalls"]),
             len(data["emergency_contacts"])))
    tl = sum(len(d["timeline"]) for d in data["itinerary"])
    nt = sum(d["stats"]["note_count"] for d in data["itinerary"])
    print("     timeline 节点合计 = %d，逐日注意事项合计 = %d 条" % (tl, nt))
    for d in data["itinerary"]:
        for k in ("day", "date", "timeline", "spots", "notes", "hotel", "stats"):
            if k not in d:
                print("     ✗ D%s 缺字段 %s" % (d.get("day"), k))
                ok = False

    # 5. README
    readme = os.path.join(OUT, "README.md")
    if os.path.exists(readme):
        print("[MD] README.md 行数 = %d" % file_lines(readme))
    else:
        print("[MD] README.md 尚未生成（人工撰写）")

    print("=" * 68)
    print("总体自检：%s" % ("✓ 全部通过" if ok else "✗ 存在问题，见上"))
    return ok


def main():
    pois = build_pois()
    merged_path, merged_text, sum_lines = build_merged_md()
    itin_path, _ = write_itinerary_csv()
    poi_path = write_pois_csv(pois)
    json_path, _ = write_knowledge_json(pois)

    print("已生成：")
    for p in (merged_path, itin_path, poi_path, json_path):
        print("  - %s（%.1f KB）" % (os.path.relpath(p, os.path.dirname(KB)),
                                   os.path.getsize(p) / 1024.0))
    print()
    verify(merged_path, merged_text, sum_lines, itin_path, poi_path, json_path, pois)


if __name__ == "__main__":
    main()

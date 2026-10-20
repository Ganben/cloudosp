"""安装后的自检：给 deploy/install.sh 调用，输出 PASS/FAIL 汇总。"""

import frappe

EXPECTED_DOCTYPES = [
	"Lease Spec",
	"Data Center",
	"Network Zone",
	"Region",
	"Resource Pool",
	"Lease Product",
	"Lease Product Spec",
	"Lease Product Stock",
	"Lease Product Quota",
	"Lease Asset",
	"Lease Asset Application",
	"Lease Asset Job",
	"Lease Order",
	"Lease Order Item",
	"Application Profile",
	"Lease Plan Order",
	"Lease Plan Order Item",
	"Lease Plan Order Summary",
	"Lease Replenish Order",
	"Lease Asset Receipt",
	"Lease Asset Receipt Item",
	"Lease Asset Receipt Capacity",
	"Lease Request Process",
	"Lease Request Product",
	"Lease Request Delivery",
	"Lease Request Tag",
	"Lease Request Pool Reading",
	"Lease Issue",
]

EXPECTED_PAGES = [
	"lease-asset-dashboard",
	"ops-dashboard",
	"lease-plan-board",
	"product-catalog-admin",
	"resource-pool-admin",
	"expansion-control",
	"asset-receipt",
	"lease-request-process",
	"issue-list",
]

# (fixture 对应的 DocType, 期望的最小记录数) —— 用于确认 migrate 已导入示例数据
EXPECTED_FIXTURES = [
	("Lease Spec", 9),
	("Data Center", 2),
	("Network Zone", 3),
	("Region", 3),
	("Resource Pool", 3),
	("Lease Product", 4),
	("Lease Product Stock", 4),
]

REQUIRED_APPS = ("frappe", "erpnext")


@frappe.whitelist()
def summary():
	"""安装结果汇总，返回可读文本"""
	lines = []
	ok = True

	installed = frappe.get_installed_apps()
	lines.append(f"已安装应用：{', '.join(installed)}")
	missing_apps = [app for app in REQUIRED_APPS if app not in installed]
	if missing_apps:
		ok = False
		lines.append(f"FAIL 缺少依赖应用：{', '.join(missing_apps)}")
	else:
		lines.append("PASS 依赖应用（frappe / erpnext）齐全")

	missing_dt = [name for name in EXPECTED_DOCTYPES if not frappe.db.exists("DocType", name)]
	if missing_dt:
		ok = False
		lines.append(f"FAIL 缺少 DocType（{len(missing_dt)}）：{', '.join(missing_dt)}")
	else:
		lines.append(f"PASS DocType 齐全（{len(EXPECTED_DOCTYPES)} 个）")

	missing_pages = [name for name in EXPECTED_PAGES if not frappe.db.exists("Page", name)]
	if missing_pages:
		ok = False
		lines.append(f"FAIL 缺少 Page（{len(missing_pages)}）：{', '.join(missing_pages)}")
	else:
		lines.append(f"PASS Page 齐全（{len(EXPECTED_PAGES)} 个）")

	for doctype, minimum in EXPECTED_FIXTURES:
		count = frappe.db.count(doctype)
		if count < minimum:
			ok = False
			lines.append(f"FAIL {doctype} 记录数 {count} < 期望 {minimum}（fixtures 可能未导入）")
		else:
			lines.append(f"PASS {doctype} 记录数 {count}（>= {minimum}）")

	lines.append("总体：" + ("PASS" if ok else "FAIL"))

	return "\n".join(lines)

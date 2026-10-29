"""初始化产品类型主数据，并把旧的产品类型取值映射到新主数据。"""

import frappe

PRODUCT_TYPES = (
	("云计算产品", "计算", 0, "云主机等组合型计算产品，包含存储、计算、网络资源"),
	("通算智算产品", "计算", 1, "通用算力 / 智能算力基础产品"),
	("云硬盘", "存储", 1, "块存储云硬盘（系统盘 / 数据盘）"),
	("对象存储", "存储", 1, "共享存储 / 对象存储"),
	("EIP", "网络", 1, "弹性公网 IP"),
	("CLB", "网络", 1, "负载均衡"),
	("NAT", "网络", 1, "NAT 网关"),
)

LEGACY_TYPE_MAP = {
	"云主机计算": "云计算产品",
	"云存储": "云硬盘",
	"IP": "EIP",
}


def execute():
	for type_name, category, is_base_product, description in PRODUCT_TYPES:
		if frappe.db.exists("Product Type", type_name):
			continue
		frappe.get_doc(
			{
				"doctype": "Product Type",
				"type_name": type_name,
				"category": category,
				"is_base_product": is_base_product,
				"description": description,
			}
		).insert(ignore_permissions=True)

	for old_value, new_value in LEGACY_TYPE_MAP.items():
		frappe.db.set_value("Cloud Product", {"product_type": old_value}, "product_type", new_value)
		frappe.db.set_value("Resource Spec", {"product_type": old_value}, "product_type", new_value)

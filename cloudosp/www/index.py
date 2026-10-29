"""网站首页看板：资源概况、订单概况与页面索引。"""

import frappe
from frappe import _

from cloudosp.utils.portal import get_user_tenant, is_manager

PAGE_INDEX = [
	{
		"group": "订单操作",
		"items": [
			{
				"title": "资源申请订单",
				"description": "按云产品清单下单，提交时校验资源池可售库存",
				"route": "/resource-application-order",
				"icon": "file-plus",
				"tag": "新建",
			},
			{
				"title": "资源预订单",
				"description": "不校验库存，提交后按容量需求预占资源池",
				"route": "/resource-pre-order",
				"icon": "calendar-plus",
				"tag": "新建",
			},
			{
				"title": "我的订单",
				"description": "查看本租户的申请订单与预订单，草稿可提交下单",
				"route": "/my-orders",
				"icon": "list",
				"tag": "门户",
			},
		],
	},
	{
		"group": "数据维护（Desk）",
		"items": [
			{
				"title": "云产品新增向导",
				"description": "分步新增产品：存储、计算、网络配置与可售库存",
				"route": "/app/pool-wizard",
				"icon": "wand",
				"tag": "向导",
			},
			{
				"title": "产品类型",
				"description": "计算 / 存储 / 网络产品类型与基础产品分类",
				"route": "/app/product-type",
				"icon": "tag",
				"tag": "主数据",
			},
			{
				"title": "云产品目录",
				"description": "首页展示的可售产品与每个型号的可售数量",
				"route": "/app/catalog-item",
				"icon": "shopping-cart",
				"tag": "目录",
			},
			{"title": "租户", "description": "租户与联系人信息", "route": "/app/tenant", "icon": "users", "tag": "主数据"},
			{"title": "资源池", "description": "资源池与区域", "route": "/app/resource-pool", "icon": "server", "tag": "主数据"},
			{
				"title": "AZ 容量池",
				"description": "可售库存、预占数量与可用量",
				"route": "/app/az-capacity-pool",
				"icon": "database",
				"tag": "库存",
			},
			{"title": "云产品", "description": "云主机计算 / 云存储 / IP 产品", "route": "/app/cloud-product", "icon": "box", "tag": "主数据"},
			{"title": "规格", "description": "约定资源量与容量需求映射", "route": "/app/resource-spec", "icon": "sliders", "tag": "主数据"},
			{
				"title": "资源申请订单（Desk）",
				"description": "全部申请订单列表与明细",
				"route": "/app/resource-application-order",
				"icon": "file-text",
				"tag": "列表",
			},
			{
				"title": "资源预订单（Desk）",
				"description": "全部预订单列表与明细",
				"route": "/app/resource-pre-order",
				"icon": "file-clock",
				"tag": "列表",
			},
		],
	},
]


def _order_stats(doctype: str, tenant: str | None) -> dict:
	filters = {} if tenant is None else {"tenant": tenant}
	return {
		"total": frappe.db.count(doctype, {**filters, "docstatus": ["<", 2]}),
		"draft": frappe.db.count(doctype, {**filters, "docstatus": 0}),
		"submitted": frappe.db.count(doctype, {**filters, "docstatus": 1}),
	}


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=%2F"
		raise frappe.Redirect

	context.no_cache = 1
	context.title = _("云资源运营看板")
	context.is_manager = is_manager()
	context.tenant = get_user_tenant()

	context.stats = {
		"tenants": frappe.db.count("Tenant", {"enabled": 1}),
		"pools": frappe.db.count("Resource Pool", {"disabled": 0}),
		"products": frappe.db.count("Cloud Product", {"enabled": 1}),
		"specs": frappe.db.count("Resource Spec"),
	}
	context.application_orders = _order_stats("Resource Application Order", None if context.is_manager else context.tenant)
	context.pre_orders = _order_stats("Resource Pre-order", None if context.is_manager else context.tenant)

	context.capacity_rows = frappe.db.sql(
		"""select resource_pool, capacity_type,
				sum(sellable_stock) as sellable,
				sum(reserved_qty) as reserved
			from `tabAZ Capacity Pool`
			group by resource_pool, capacity_type
			order by resource_pool, capacity_type""",
		as_dict=True,
	)
	for row in context.capacity_rows:
		row["available"] = (row.sellable or 0) - (row.reserved or 0)
		row["reserved_pct"] = (
			round((row.reserved or 0) / row.sellable * 100, 1) if row.sellable else 0
		)

	context.catalog_items = frappe.get_all(
		"Catalog Item",
		filters={"enabled": 1},
		fields=["name", "model_name", "resource_pool", "cloud_product", "spec", "sellable_qty"],
		order_by="cloud_product asc, sellable_qty desc",
		limit_page_length=100,
	)

	context.page_index = PAGE_INDEX
	context.web_form_routes = {
		wf.doc_type: wf.route
		for wf in frappe.get_all(
			"Web Form",
			filters={
				"doc_type": ["in", ["Resource Application Order", "Resource Pre-order"]],
				"published": 1,
			},
			fields=["route", "doc_type"],
		)
	}
	return context

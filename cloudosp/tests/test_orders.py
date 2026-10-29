"""订单与库存逻辑集成测试：容量需求计算、预订单预占/释放、申请订单库存校验。"""

import frappe
from frappe.tests import IntegrationTestCase

POOL = "_Test Pool BJ"
AZ_A = "_Test AZ A"
AZ_B = "_Test AZ B"
TENANT = "_Test Tenant"
PRODUCT = "_Test ECS"
SPEC = "_Test ECS-4C8G"


def _ensure_master():
	if not frappe.db.exists("Tenant", TENANT):
		frappe.get_doc({"doctype": "Tenant", "tenant_name": TENANT}).insert()
	if not frappe.db.exists("Resource Pool", POOL):
		frappe.get_doc(
			{"doctype": "Resource Pool", "pool_code": POOL, "pool_name": "测试资源池"}
		).insert()
		for az, stock in ((AZ_A, 100), (AZ_B, 50)):
			frappe.get_doc(
				{
					"doctype": "AZ Capacity Pool",
					"resource_pool": POOL,
					"az_name": az,
					"capacity_type": "计算",
					"total_capacity": 1000,
					"sellable_stock": stock,
				}
			).insert()
	if not frappe.db.exists("Cloud Product", PRODUCT):
		frappe.get_doc(
			{
				"doctype": "Cloud Product",
				"product_code": PRODUCT,
				"product_name": "测试云主机",
				"product_type": "云计算产品",
				"resource_pool": POOL,
			}
		).insert()
	if not frappe.db.exists("Resource Spec", SPEC):
		frappe.get_doc(
			{
				"doctype": "Resource Spec",
				"spec_code": SPEC,
				"spec_name": "测试规格 4C8G",
				"cloud_product": PRODUCT,
				"vcpu_count": 4,
				"memory_gb": 8,
				"capacity_requirements": [{"capacity_type": "计算", "requirement_qty": 1}],
			}
		).insert()


def _reserved_total() -> float:
	return sum(
		r.reserved_qty or 0
		for r in frappe.get_all(
			"AZ Capacity Pool",
			filters={"resource_pool": POOL},
			fields=["reserved_qty"],
		)
	)


def _order(doctype: str, quantity: int) -> "frappe.Document":
	return frappe.get_doc(
		{
			"doctype": doctype,
			"tenant": TENANT,
			"items": [{"cloud_product": PRODUCT, "spec": SPEC, "quantity": quantity}],
		}
	).insert()


class TestOrdersAndStock(IntegrationTestCase):
	def setUp(self):
		_ensure_master()
		self.addCleanup(self._cleanup)

	def _cleanup(self):
		# 清理本类遗留单据与预占，保证各测试相互独立
		for doctype in ("Resource Pre-order", "Resource Application Order"):
			frappe.db.sql(f"delete from `tab{doctype}` where tenant = %s", (TENANT,))
		frappe.db.sql(
			"update `tabAZ Capacity Pool` set reserved_qty = 0 where resource_pool = %s", (POOL,)
		)

	def test_pre_order_reserves_without_validation_and_releases_on_cancel(self):
		# 预订单：不校验库存（需求超过可售也可提交），提交计入预占，取消释放
		pre = _order("Resource Pre-order", 500)
		pre.submit()
		self.assertEqual(pre.status, "已提交")
		self.assertEqual(_reserved_total(), 500)

		pre.cancel()
		self.assertEqual(pre.status, "已取消")
		self.assertEqual(_reserved_total(), 0)

	def test_application_order_within_stock(self):
		app = _order("Resource Application Order", 10)
		app.submit()
		self.assertEqual(app.status, "已提交")
		self.assertIn("需求 10", app.capacity_demand_summary)
		# 申请订单不改变预占数量
		self.assertEqual(_reserved_total(), 0)

	def test_application_order_over_stock_blocked(self):
		app = _order("Resource Application Order", 151)  # 可售 100 + 50
		with self.assertRaises(frappe.ValidationError):
			app.submit()

	def test_application_order_considers_pre_order_reservation(self):
		# 可售 150，预订单预占 100 后，申请订单可售量只剩 50
		pre = _order("Resource Pre-order", 100)
		pre.submit()
		app = _order("Resource Application Order", 51)
		with self.assertRaises(frappe.ValidationError):
			app.submit()

		app_ok = _order("Resource Application Order", 50)
		app_ok.submit()
		self.assertEqual(app_ok.status, "已提交")

	def test_capacity_demand_calculation(self):
		from cloudosp.utils.stock import get_capacity_demand

		items = [{"cloud_product": PRODUCT, "spec": SPEC, "quantity": 3}]
		demand = get_capacity_demand([frappe._dict(quantity=i["quantity"], spec=i["spec"]) for i in items])
		self.assertEqual(demand[(POOL, "计算")], 3)

	def test_item_validation(self):
		# 规格与产品不匹配应报错
		doc = frappe.get_doc(
			{
				"doctype": "Resource Application Order",
				"tenant": TENANT,
				"items": [{"cloud_product": PRODUCT, "spec": "不存在的规格", "quantity": 1}],
			}
		)
		with self.assertRaises(frappe.ValidationError):
			doc.insert()

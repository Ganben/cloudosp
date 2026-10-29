"""产品新增向导与云产品目录测试（含存储 / 计算 / 网络配置）。"""

import json

import frappe
from frappe.tests import IntegrationTestCase

from cloudosp.utils.wizard import create_configuration, get_pool_context, get_product_types

POOL = "_Test Wizard Pool"
PRODUCT = "_Test Wizard ECS"
SPEC = "_Test Wizard Spec"
EIP_PRODUCT = "_Test Wizard EIP"
EIP_SPEC = "_Test Wizard EIP Spec"


def _eip_payload() -> dict:
	return {
		"pool": {"pool_code": POOL, "pool_name": "测试向导资源池", "region": "测试区域"},
		"product": {
			"product_code": EIP_PRODUCT,
			"product_name": "测试弹性公网IP",
			"product_type": "EIP",
		},
		"spec": {
			"spec_code": EIP_SPEC,
			"spec_name": "10Mbps BGP",
			"requirements": {"IP": 1},
			"network_items": [{"network_type": "EIP", "quantity": 1, "bandwidth_mbps": 10}],
		},
		"catalog": {"sellable_qty": 100, "enabled": 1},
	}


def _payload(sellable_qty: float = 100) -> dict:
	return {
		"pool": {"pool_code": POOL, "pool_name": "测试向导资源池", "region": "测试区域"},
		"product": {
			"product_code": PRODUCT,
			"product_name": "测试云主机",
			"product_type": "云计算产品",
		},
		"spec": {
			"spec_code": SPEC,
			"spec_name": "4核8G",
			"vcpu_count": 4,
			"memory_gb": 8,
			"disk_gb": 250,
			"ip_count": 1,
			"requirements": {"计算": 1, "存储": 250, "IP": 1},
			"storage_items": [
				{
					"storage_type": "系统盘",
					"storage_model": "云硬盘",
					"capacity_gb": 50,
					"quantity": 1,
					"performance": "SSD",
				},
				{"storage_type": "数据盘", "storage_model": "云硬盘", "capacity_gb": 200, "quantity": 1},
				{"storage_type": "共享存储", "storage_model": "对象存储", "capacity_gb": 500, "quantity": 1},
			],
			"compute_items": [
				{"compute_type": "CPU", "spec_model": "Intel Xeon 8核", "quantity": 1},
				{"compute_type": "内存", "spec_model": "16GB DDR4", "quantity": 1},
			],
			"network_items": [
				{"network_type": "私网网卡", "binding_target": "VPC-TEST", "quantity": 1},
				{"network_type": "私网IP", "quantity": 1},
				{
					"network_type": "EIP",
					"linked_product": EIP_PRODUCT,
					"binding_target": "绑定云主机",
					"quantity": 1,
					"bandwidth_mbps": 10,
				},
				{"network_type": "CLB", "binding_target": "后端云主机", "quantity": 1},
			],
		},
		"catalog": {"sellable_qty": sellable_qty, "enabled": 1},
	}


class TestPoolWizard(IntegrationTestCase):
	def test_product_types_seeded(self):
		types = {row["name"]: row for row in get_product_types()}
		self.assertIn("云计算产品", types)
		self.assertIn("云硬盘", types)
		self.assertIn("EIP", types)
		self.assertEqual(types["云计算产品"]["category"], "计算")
		self.assertFalse(types["云计算产品"]["is_base_product"])
		self.assertTrue(types["云硬盘"]["is_base_product"])

	def test_create_configuration_with_all_resource_types(self):
		result = create_configuration(json.dumps(_payload()))

		self.assertEqual(result["pool"], POOL)
		self.assertEqual(result["product"], PRODUCT)
		self.assertEqual(result["spec"], SPEC)

		spec = frappe.get_doc("Resource Spec", SPEC)
		self.assertEqual(
			[(row.storage_type, row.storage_model, row.capacity_gb) for row in spec.storage_items],
			[("系统盘", "云硬盘", 50.0), ("数据盘", "云硬盘", 200.0), ("共享存储", "对象存储", 500.0)],
		)
		self.assertEqual(
			[(row.compute_type, row.spec_model) for row in spec.compute_items],
			[("CPU", "Intel Xeon 8核"), ("内存", "16GB DDR4")],
		)
		self.assertEqual(len(spec.network_items), 4)
		eip_row = next(row for row in spec.network_items if row.network_type == "EIP")
		self.assertEqual(eip_row.linked_product, EIP_PRODUCT)
		self.assertEqual(eip_row.bandwidth_mbps, 10)
		self.assertEqual(
			{(row.capacity_type, row.requirement_qty) for row in spec.capacity_requirements},
			{("计算", 1.0), ("存储", 250.0), ("IP", 1.0)},
		)

		catalog = frappe.get_all(
			"Catalog Item",
			filters={"resource_pool": POOL, "cloud_product": PRODUCT},
			fields=["name", "model_name", "sellable_qty"],
		)
		self.assertEqual(len(catalog), 1)
		self.assertIn("测试云主机", catalog[0].model_name)
		self.assertEqual(catalog[0].sellable_qty, 100)

	def test_basic_products_supported(self):
		create_configuration(json.dumps(_eip_payload()))
		result = create_configuration(json.dumps(_payload()))
		self.assertTrue(result)

		product = frappe.get_doc("Cloud Product", EIP_PRODUCT)
		self.assertEqual(product.product_type, "EIP")
		eip_spec = frappe.get_doc("Resource Spec", EIP_SPEC)
		self.assertEqual(eip_spec.storage_items, [])
		self.assertEqual(eip_spec.compute_items, [])
		self.assertEqual(len(eip_spec.network_items), 1)

	def test_create_configuration_is_idempotent(self):
		create_configuration(json.dumps(_payload(sellable_qty=100)))
		create_configuration(json.dumps(_payload(sellable_qty=42)))

		self.assertEqual(
			frappe.db.get_value(
				"Catalog Item", {"resource_pool": POOL, "spec": SPEC}, "sellable_qty"
			),
			42,
		)
		spec = frappe.get_doc("Resource Spec", SPEC)
		self.assertEqual(len(spec.storage_items), 3)
		self.assertEqual(len(spec.compute_items), 2)
		self.assertEqual(len(spec.network_items), 4)
		self.assertEqual(len(spec.capacity_requirements), 3)
		self.assertEqual(frappe.db.count("Cloud Product", {"resource_pool": POOL}), 2)

	def test_get_pool_context_returns_existing_configuration(self):
		self.assertFalse(get_pool_context("_Test Wizard Unknown Pool")["exists"])
		create_configuration(json.dumps(_payload()))
		context = get_pool_context(POOL)
		self.assertTrue(context["exists"])
		self.assertIn(PRODUCT, [row["name"] for row in context["products"]])
		self.assertTrue(context["catalog_items"])

	def test_invalid_product_type_rejected(self):
		payload = _payload()
		payload["product"]["product_type"] = "不存在的类型"
		with self.assertRaises(frappe.ValidationError):
			create_configuration(json.dumps(payload))

	def test_storage_model_mismatch_rejected(self):
		payload = _payload()
		payload["spec"]["storage_items"] = [
			{"storage_type": "共享存储", "storage_model": "云硬盘", "capacity_gb": 100}
		]
		with self.assertRaises(frappe.ValidationError):
			create_configuration(json.dumps(payload))

	def test_network_linked_product_must_exist(self):
		payload = _payload()
		payload["spec"]["network_items"] = [
			{"network_type": "EIP", "linked_product": "_Not Existing Product", "quantity": 1}
		]
		with self.assertRaises(frappe.ValidationError):
			create_configuration(json.dumps(payload))

	def test_wizard_rejects_spec_without_capacity_requirement(self):
		payload = _payload()
		payload["spec"]["requirements"] = {"计算": 0, "存储": 0, "IP": 0}
		with self.assertRaises(frappe.ValidationError):
			create_configuration(json.dumps(payload))

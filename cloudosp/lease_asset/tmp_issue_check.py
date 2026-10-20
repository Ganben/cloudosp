import frappe

M = "cloudosp.lease_asset.issue_api"
PAGE = "asset-receipt"


def run():
    out = {}
    fn = frappe.get_attr

    res = fn(f"{M}.create_issue")(page=PAGE, title="ZZ 测试 Issue", description="联调描述内容")
    out["提交"] = res

    for label, kwargs in [
        ("空标题", {"page": PAGE, "title": " ", "description": "x"}),
        ("空正文", {"page": PAGE, "title": "t", "description": " "}),
    ]:
        try:
            fn(f"{M}.create_issue")(**kwargs)
            out[label] = "未拦截(异常)"
        except Exception:
            out[label] = "已拦截"

    rows = fn(f"{M}.get_issues")()
    out["列表条数"] = len(rows)
    out["首条"] = [
        (r["name"], r["title"], r["page"], r["page_title"], r["status"], r["submitted_by"]) for r in rows[:1]
    ]

    out["过滤待处理"] = len(fn(f"{M}.get_issues")(status="待处理"))

    fn(f"{M}.set_status")(name=res["name"], status="已处理")
    out["标记后"] = frappe.db.get_value("Lease Issue", res["name"], "status")

    doc = frappe.get_doc("Lease Issue", res["name"])
    out["DocType数据"] = {
        "page": doc.page,
        "submitted_by": doc.submitted_by,
        "description": doc.description,
    }

    frappe.delete_doc("Lease Issue", res["name"], force=True, ignore_permissions=True)
    out["cleaned"] = True
    out["remaining"] = frappe.db.count("Lease Issue")
    return out

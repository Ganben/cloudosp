frappe.ready(function () {
	const productsEl = document.getElementById("la-products");
	if (!productsEl) return;

	const products = JSON.parse(productsEl.textContent);
	const toggleBtn = document.getElementById("la-toggle-order");
	const panel = document.getElementById("la-order-panel");
	const tbody = document.querySelector("#la-items tbody");
	const form = document.getElementById("la-order-form");
	const poolFilter = document.getElementById("la-pool-filter");

	if (poolFilter) {
		poolFilter.addEventListener("change", () => {
			const pool = poolFilter.value;
			window.location.search = pool ? `?pool=${encodeURIComponent(pool)}` : "";
		});
	}

	if (toggleBtn && panel) {
		toggleBtn.addEventListener("click", () => {
			const open = panel.classList.toggle("la-open");
			toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
			toggleBtn.textContent = open ? __("收起下单表单") : __("新增租赁订单");
		});
	}

	const productOptions = (selected) =>
		products
			.map(
				(p) =>
					`<option value="${p.name}">${p.product_name || p.name}${
						p.product_code ? " (" + p.product_code + ")" : ""
					}${p.list_price ? " · " + p.list_price : ""}</option>`
			)
			.join("");

	const addRow = () => {
		const row = document.createElement("tr");
		row.innerHTML = `
			<td><select class="form-select form-select-sm" required>${productOptions()}</select></td>
			<td><input type="number" class="form-control form-control-sm" value="1" min="1" step="any" required></td>
			<td><input type="number" class="form-control form-control-sm" value="1" min="1" step="1" required></td>
			<td><button type="button" class="btn btn-sm btn-outline-danger">&times;</button></td>`;
		tbody.appendChild(row);
		row.querySelector("button").addEventListener("click", () => {
			if (tbody.querySelectorAll("tr").length > 1) row.remove();
		});
	};

	document.getElementById("la-add-item").addEventListener("click", addRow);
	addRow();

	const setMessage = (html) => {
		document.getElementById("la-msg").innerHTML = html;
	};

	const collectArgs = (confirm) => ({
		customer: form.elements.customer.value,
		start_date: form.elements.start_date.value,
		end_date: form.elements.end_date.value,
		remarks: form.elements.remarks.value,
		items: JSON.stringify(
			Array.from(tbody.querySelectorAll("tr")).map((row) => ({
				product: row.querySelector("select").value,
				quantity: row.querySelectorAll("input")[0].value,
				lease_months: row.querySelectorAll("input")[1].value,
			}))
		),
		confirm: confirm ? 1 : 0,
	});

	form.addEventListener("submit", (e) => {
		e.preventDefault();
		const btn = form.querySelector('button[type="submit"]');
		setMessage("");
		btn.disabled = true;

		frappe.call({
			method: "cloudosp.lease_asset.api.create_lease_order",
			args: collectArgs(false),
			callback: (r) => {
				btn.disabled = false;
				const res = r.message || {};

				if (res.confirm_required) {
					const list = res.issues.map((i) => `<li>${frappe.utils.escape_html(i)}</li>`).join("");
					if (!confirm(`${__("以下项目需要处理")}:\n\n${res.issues.join("\n")}\n\n${__("是否仍然提交")}?`)) {
						setMessage(`<div class="alert alert-warning"><ul class="mb-0">${list}</ul></div>`);
						return;
					}
					setMessage(`<div class="alert alert-warning"><ul class="mb-0">${list}</ul></div>`);
					btn.disabled = true;
					frappe.call({
						method: "cloudosp.lease_asset.api.create_lease_order",
						args: collectArgs(true),
						callback: (r2) => {
							btn.disabled = false;
							const done = r2.message || {};
							setMessage(
								`<div class="alert alert-success">${__("订单")} ${done.name} ${__("创建成功")}，${__(
									"合计"
								)} ${done.total_amount}</div>`
							);
							setTimeout(() => window.location.reload(), 1500);
						},
						error: (err) => {
							btn.disabled = false;
							setMessage(`<div class="alert alert-danger">${frappe.utils.escape_html(err)}</div>`);
						},
					});
					return;
				}

				setMessage(
					`<div class="alert alert-success">${__("订单")} ${res.name} ${__("创建成功")}，${__(
						"合计"
					)} ${res.total_amount}</div>`
				);
				setTimeout(() => window.location.reload(), 1500);
			},
			error: (err) => {
				btn.disabled = false;
				setMessage(`<div class="alert alert-danger">${frappe.utils.escape_html(err)}</div>`);
			},
		});
	});
});

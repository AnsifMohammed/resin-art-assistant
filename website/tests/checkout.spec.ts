import { test, expect } from "@playwright/test";

test.describe("Saba Art E2E Checkout Flow", () => {
  test("happy path: browse catalogue -> add to cart -> checkout -> success page", async ({
    page,
  }) => {
    // 0. Mock network APIs & window.Razorpay before navigating
    await page.route("**/api/checkout/create-order", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          orderNo: "SA-E2E-999",
          razorpayOrderId: "order_mock_e2e_999",
          amount: 120000,
          currency: "INR",
          keyId: "rzp_test_mock",
          pricing: {
            subtotal: 1200,
            discountTotal: 0,
            deliveryCharge: 0,
            total: 1200,
            dispatchByDate: "2026-12-05",
          },
        }),
      });
    });

    await page.route("**/api/checkout/verify", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          orderNo: "SA-E2E-999",
          message: "Order placed and verified successfully",
        }),
      });
    });

    await page.route("**/api/orders/SA-E2E-999", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          order: {
            orderNo: "SA-E2E-999",
            razorpayOrderId: "order_mock_e2e_999",
            status: "confirmed",
            customerName: "Priya Raman",
            customerPhone: "9876543210",
            customerEmail: "priya@example.com",
            dispatchByDate: "Sat, 5 Dec",
            shippingAddress: {
              addressLine: "104 Race Course Road",
              city: "Coimbatore",
              state: "Tamil Nadu",
              pincode: "641001",
            },
            items: [
              {
                id: "1",
                slug: "ocean-coaster-set-4",
                name: "Ocean Coaster Set of 4",
                sizeName: "10cm round",
                unitPrice: 1200,
                quantity: 1,
                leadTimeDays: 5,
              },
            ],
            pricing: {
              subtotal: 1200,
              discountTotal: 0,
              deliveryCharge: 0,
              total: 1200,
              dispatchByDate: "2026-12-05",
            },
            timeline: [],
            journal: [],
            createdAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.route("https://checkout.razorpay.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `
          window.Razorpay = function (options) {
            return {
              open: function () {
                setTimeout(function () {
                  if (options.handler) {
                    options.handler({
                      razorpay_payment_id: "pay_e2e_mock_123",
                      razorpay_order_id: options.order_id || "order_mock_e2e_999",
                      razorpay_signature: "signature_e2e_mock_valid",
                    });
                  }
                }, 50);
              }
            };
          };
        `,
      });
    });

    // 1. Visit the shop catalogue
    await page.goto("/shop");
    await expect(page).toHaveTitle(/Saba Art/);

    // 2. Click on a product (e.g. Ocean Coaster Set)
    const productCard = page.locator("a[href='/product/ocean-coaster-set-4']").first();
    await expect(productCard).toBeVisible();
    await productCard.click();

    // 3. On Product Detail Page, verify details and Add to Cart
    await expect(page).toHaveURL(/\/product\/ocean-coaster-set-4/);
    const addToCartBtn = page.getByRole("button", { name: /Add to Cart/i }).first();
    await expect(addToCartBtn).toBeVisible();
    await addToCartBtn.click();

    // 4. In Cart Drawer or Cart Page, navigate to Checkout
    const checkoutBtn = page.getByRole("link", { name: /Proceed to Checkout/i }).first();
    await expect(checkoutBtn).toBeVisible();
    await checkoutBtn.click();

    // 5. On /checkout page, fill contact and delivery details
    await expect(page).toHaveURL(/\/checkout/);

    await page.getByPlaceholder(/Priya Raman/i).fill("Priya Raman");
    await page.getByPlaceholder(/98765/i).fill("9876543210");
    await page.getByPlaceholder(/priya@example.com/i).fill("priya@example.com");

    await page.getByPlaceholder(/Flat 402/i).fill("104 Race Course Road");

    // Agree to mandatory 12-hour cancellation policy
    const policyCheckbox = page.locator("input[type='checkbox'][required]");
    await policyCheckbox.check();

    // 6. Submit order
    const submitBtn = page.getByRole("button", { name: /Pay/i });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // 7. Assert redirection to success page with order number
    await expect(page).toHaveURL(/\/checkout\/success\?orderNo=SA-E2E-999/, { timeout: 10000 });
    await expect(page.getByText("#SA-E2E-999")).toBeVisible();
    await expect(page.getByText(/We're getting your resin ready to pour/i)).toBeVisible();
  });
});

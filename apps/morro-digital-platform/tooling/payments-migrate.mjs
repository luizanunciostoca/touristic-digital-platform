import {
  applyFinancialM145Schema,
  createFinancialMySqlPoolFromEnvironment,
} from "@touristic/financial-server";
import {
  applyOrderingM151Schema,
  applyOrderingTicketingReservationSchema,
  createOrderingMySqlPoolFromEnvironment,
} from "@touristic/ordering-server";

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const environment = Object.freeze({
  ORDERING_DATABASE_URL: required("ORDERING_DATABASE_URL"),
  FINANCIAL_DATABASE_URL: required("FINANCIAL_DATABASE_URL"),
});

const orderingPool = createOrderingMySqlPoolFromEnvironment(environment);
const financialPool = createFinancialMySqlPoolFromEnvironment(environment);

try {
  await Promise.all([
    (async () => {
      await applyOrderingM151Schema(orderingPool);
      await applyOrderingTicketingReservationSchema(orderingPool);
    })(),
    applyFinancialM145Schema(financialPool),
  ]);

  await Promise.all([
    orderingPool.query("SELECT 1 AS ordering_ready"),
    financialPool.query("SELECT 1 AS financial_ready"),
  ]);

  process.stdout.write(
    `${JSON.stringify({
      contract: "PAYMENTS-PREDEPLOY-MIGRATION",
      contractVersion: 1,
      status: "pass",
      ordering: "M151+ticketing-reservation",
      financial: "M145",
    })}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      contract: "PAYMENTS-PREDEPLOY-MIGRATION",
      contractVersion: 1,
      status: "fail",
      reason: error instanceof Error ? error.message : "unknown migration failure",
    })}\n`,
  );
  process.exitCode = 1;
} finally {
  await Promise.allSettled([orderingPool.end(), financialPool.end()]);
}

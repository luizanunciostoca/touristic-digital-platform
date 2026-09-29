[
  .logs[]?.message
  | fromjson?
  | select(
      .contract == $contract
      and .status == "fail"
      and ((.code | type) == "string")
      and (.code | test("^[A-Z0-9_]{1,128}$"))
    )
  | .code
][0] // empty

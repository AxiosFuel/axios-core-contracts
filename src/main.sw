contract;
mod events;
mod interface;
use interface::{Error, FixedMarket, Loan, ProtocolConfig, SRC20, Status};

use events::*;
use std::auth::msg_sender;
use std::block::timestamp;
use std::logging::log;
use std::context::{msg_amount, this_balance};
use std::call_frames::msg_asset_id;
use std::contract_id::ContractId;
use std::bytes::Bytes;
use std::asset::*;
use stork_sway_sdk::interface::{Stork, TemporalNumericValueInput};
use signed_int::i128::I128;

configurable {
    PROTOCOL_OWNER: Address = Address::zero(),
}

storage {
    loans: StorageMap<u64, Loan> = StorageMap {},
    loan_length: u64 = 0,
    stork_contract: ContractId = ContractId::zero(),
    oracle_config: StorageMap<b256, b256> = StorageMap {},
    protocol_config: ProtocolConfig = ProtocolConfig::default(),
    protocol_admin: Address = Address::zero(),
    is_paused: bool = true,
}
impl FixedMarket for Contract {
    #[storage(read, write)]
    fn update_oracle_contract(addr: b256) {
        only_protocol_admin();
        storage.stork_contract.write(addr.into());
    }

    #[storage(read, write)]
    fn update_oracle_feed_id(base_asset_id: b256, feed_id: b256) {
        only_protocol_admin();
        storage.oracle_config.insert(base_asset_id, feed_id);
    }

    #[storage(read, write)]
    fn add_admin(admin: Address) {
        only_protocol_owner();
        storage.protocol_admin.write(admin);
    }

    #[storage(read, write)]
    fn update_protocol_config(config: ProtocolConfig) {
        only_protocol_admin();
        storage.protocol_config.write(config);
    }

    #[storage(read, write)]
    fn update_protocol_status(flag: bool) {
        only_protocol_admin();
        require(
            storage
                .protocol_config
                .protocol_fee
                .read() != 0,
            Error::EProtocolConfigNotSet,
        );
        storage.is_paused.write(flag);
    }

    #[payable, storage(read, write)]
    fn request_loan(loan_info: Loan) {
        require(!is_protocol_paused(), Error::EProtocolPaused);
        require(
            Identity::Address(loan_info.borrower) == msg_sender()
                .unwrap(),
            Error::EMsgSenderAndBorrowerNotSame,
        );
        require(
            loan_info
                .repayment_amount > loan_info
                .asset_amount,
            Error::EAmountLessThanOrEqualToRepaymentAmount,
        );
        require(
            loan_info
                .duration > get_min_loan_duration(),
            Error::EInvalidDuration,
        );
        require(
            loan_info
                .asset != loan_info
                .collateral,
            Error::ESameAssetSameCollateral,
        );

        let oracle_contract_id = storage.stork_contract.read();
        require(
            oracle_contract_id != ContractId::zero(),
            Error::EOracleNotSet,
        );
        let collateral_oracle_id: b256 = storage.oracle_config.get(loan_info.collateral).try_read().unwrap_or(b256::zero());
        let asset_oracle_id: b256 = storage.oracle_config.get(loan_info.asset).try_read().unwrap_or(b256::zero());
        require(
            collateral_oracle_id != b256::zero(),
            Error::EOralceCollateralNotSet,
        );
        require(asset_oracle_id != b256::zero(), Error::EOralceAssetNotSet);

        require(
            collateral_oracle_id != asset_oracle_id,
            Error::ENoOracleFeedAvailable,
        );

        require(
            loan_info
                .liquidation
                .liquidation_threshold_in_bps > 0,
            Error::EInvalidLiqThreshold,
        );

        require(
            loan_info
                .liquidation
                .liquidation_threshold_in_bps < 8000,
            Error::EInvalidLiqThreshold,
        );
        let amount = msg_amount();
        let asset_id: b256 = msg_asset_id().into();
        require(asset_id == loan_info.collateral, Error::EInvalidCollateral);
        require(
            amount == loan_info
                .collateral_amount,
            Error::EInvalidCollateralAmount,
        );
        let mut loan: Loan = loan_info;
        loan.created_timestamp = timestamp();
        loan.start_timestamp = 0;
        loan.status = 0;
        loan.liquidation.liquidation_flag_internal = true;
        storage.loans.insert(storage.loan_length.read(), loan);
        storage.loan_length.write(storage.loan_length.read() + 1);
        log(LoanRequestedEvent {
            loan_id: storage.loan_length.read() - 1,
            borrower: loan_info.borrower,
            asset: loan_info.asset,
            asset_amount: loan_info.asset_amount,
            collateral: loan_info.collateral,
            collateral_amount: loan_info.collateral_amount,
            duration: loan_info.duration,
            repayment_amount: loan_info.repayment_amount,
            liquidation: loan.liquidation.liquidation_flag_internal,
        });
    }

    #[payable, storage(read, write)]
    fn offer_loan(loan_info: Loan) {
        require(!is_protocol_paused(), Error::EProtocolPaused);
        require(
            Identity::Address(loan_info.lender) == msg_sender()
                .unwrap(),
            Error::EMsgSenderAndLenderNotSame,
        );

        require(
            loan_info
                .repayment_amount > loan_info
                .asset_amount,
            Error::EAmountLessThanOrEqualToRepaymentAmount,
        );
        require(
            loan_info
                .duration > get_min_loan_duration(),
            Error::EInvalidDuration,
        );
        require(
            loan_info
                .asset != loan_info
                .collateral,
            Error::ESameAssetSameCollateral,
        );
        let oracle_contract_id = storage.stork_contract.read();
        require(
            oracle_contract_id != ContractId::zero(),
            Error::EOracleNotSet,
        );
        let collateral_oracle_id: b256 = storage.oracle_config.get(loan_info.collateral).try_read().unwrap_or(b256::zero());
        let asset_oracle_id: b256 = storage.oracle_config.get(loan_info.asset).try_read().unwrap_or(b256::zero());
        require(
            collateral_oracle_id != b256::zero(),
            Error::EOralceCollateralNotSet,
        );
        require(asset_oracle_id != b256::zero(), Error::EOralceAssetNotSet);

        require(
            collateral_oracle_id != asset_oracle_id,
            Error::ENoOracleFeedAvailable,
        );

        require(
            loan_info
                .liquidation
                .liquidation_threshold_in_bps > 0,
            Error::EInvalidLiqThreshold,
        );
        require(
            loan_info
                .liquidation
                .liquidation_threshold_in_bps < 8000,
            Error::EInvalidLiqThreshold,
        );
        let amount = msg_amount();
        let asset_id: b256 = msg_asset_id().into();
        require(asset_id == loan_info.asset, Error::EInvalidAsset);
        require(amount == loan_info.asset_amount, Error::EInvalidAssetAmount);
        let mut loan: Loan = loan_info;
        loan.created_timestamp = timestamp();
        loan.start_timestamp = 0;
        loan.status = 0;
        loan.liquidation.liquidation_flag_internal = true;

        storage.loans.insert(storage.loan_length.read(), loan);
        storage.loan_length.write(storage.loan_length.read() + 1);

        log(LoanOfferedEvent {
            loan_id: storage.loan_length.read() - 1,
            lender: loan_info.lender,
            asset: loan_info.asset,
            asset_amount: loan_info.asset_amount,
            collateral: loan_info.collateral,
            collateral_amount: loan_info.collateral_amount,
            duration: loan_info.duration,
            repayment_amount: loan_info.repayment_amount,
            liquidation: loan.liquidation.liquidation_flag_internal,
        });
    }

    #[payable, storage(read, write)]
    fn fill_lender_request(loan_id: u64) {
        require(!is_protocol_paused(), Error::EProtocolPaused);
        let mut loan = storage.loans.get(loan_id).read();
        require(loan.status == 0, Error::EInvalidStatus);
        require(
            loan.created_timestamp + get_req_expire_duration() > timestamp(),
            Error::EAlreadyExpired,
        );
        let borrower = get_caller_address();
        loan.borrower = borrower;
        loan.start_timestamp = timestamp();
        loan.status = 2; // magic number 2 is active (ref Enum at interface)
        storage.loans.insert(loan_id, loan);
        let amount = msg_amount();
        let asset_id: b256 = msg_asset_id().into();
        require(asset_id == loan.collateral, Error::EInvalidCollateral);
        require(
            amount == loan.collateral_amount,
            Error::EInvalidCollateralAmount,
        );
        let asset_id: AssetId = get_asset_id_from_b256(loan.asset);
        let borrower_identity: Identity = get_identity_from_address(borrower);
        transfer(borrower_identity, asset_id, loan.asset_amount);
        log(LoanOfferFilledEvent {
            loan_id,
            borrower: borrower,
            lender: loan.lender,
            asset: loan.asset,
            amount: loan.asset_amount,
            duration: loan.duration,
            liquidation: loan.liquidation.liquidation_flag_internal,
        });
    }

    #[storage(read, write)]
    fn cancel_lender_offer(loan_id: u64) {
        require(!is_protocol_paused(), Error::EProtocolPaused);
        let mut loan = storage.loans.get(loan_id).read();
        require(loan.status == 0, Error::EInvalidStatus);
        require(
            loan.created_timestamp + get_req_expire_duration() > timestamp(),
            Error::EAlreadyExpired,
        );
        require(
            Identity::Address(loan.lender) == msg_sender()
                .unwrap(),
            Error::EMsgSenderAndLenderNotSame,
        );
        loan.status = 1;
        storage.loans.insert(loan_id, loan);
        let asset_id: AssetId = get_asset_id_from_b256(loan.asset);
        transfer(msg_sender().unwrap(), asset_id, loan.asset_amount);

        log(LoanOfferedCancelledEvent {
            loan_id,
            lender: loan.lender,
            asset: loan.asset,
            amount: loan.asset_amount,
        });
    }

    #[storage(read, write)]
    fn claim_expired_loan_offer(loan_id: u64) {
        require(!is_protocol_paused(), Error::EProtocolPaused);
        let mut loan = storage.loans.get(loan_id).read();
        require(loan.status == 0, Error::EInvalidStatus);
        require(
            timestamp() > loan.created_timestamp + get_req_expire_duration(),
            Error::ELoanOfferNotExpired,
        );
        require(
            Identity::Address(loan.lender) == msg_sender()
                .unwrap(),
            Error::EMsgSenderAndLenderNotSame,
        );
        loan.status = 5;
        storage.loans.insert(loan_id, loan);
        let asset_id: AssetId = get_asset_id_from_b256(loan.asset);
        transfer(msg_sender().unwrap(), asset_id, loan.asset_amount);
        log(ClaimExpiredLoanOfferEvent {
            loan_id,
            lender: loan.lender,
            asset: loan.asset,
            amount: loan.asset_amount,
        });
    }

    #[storage(read, write)]
    fn cancel_loan(loan_id: u64) {
        require(!is_protocol_paused(), Error::EProtocolPaused);
        let mut loan = storage.loans.get(loan_id).read();
        require(loan.status == 0, Error::EInvalidStatus);
        require(
            loan.created_timestamp + get_req_expire_duration() > timestamp(),
            Error::EAlreadyExpired,
        );
        require(
            Identity::Address(loan.borrower) == msg_sender()
                .unwrap(),
            Error::EMsgSenderAndBorrowerNotSame,
        );
        loan.status = 1;
        storage.loans.insert(loan_id, loan);
        let collateral_asset_id: AssetId = get_asset_id_from_b256(loan.collateral);
        transfer(
            msg_sender()
                .unwrap(),
            collateral_asset_id,
            loan.collateral_amount,
        );
        log(LoanCancelledEvent {
            loan_id,
            borrower: loan.borrower,
            collateral: loan.collateral,
            amount: loan.collateral_amount,
        });
    }
    #[storage(read, write)]
    fn claim_expired_loan_req(loan_id: u64) {
        require(!is_protocol_paused(), Error::EProtocolPaused);
        let mut loan = storage.loans.get(loan_id).read();
        require(loan.status == 0, Error::EInvalidStatus);
        require(
            timestamp() > loan.created_timestamp + get_req_expire_duration(),
            Error::ELoanReqNotExpired,
        );
        require(
            Identity::Address(loan.borrower) == msg_sender()
                .unwrap(),
            Error::EMsgSenderAndBorrowerNotSame,
        );
        loan.status = 5;
        storage.loans.insert(loan_id, loan);
        let collateral_asset_id: AssetId = get_asset_id_from_b256(loan.collateral);
        transfer(
            msg_sender()
                .unwrap(),
            collateral_asset_id,
            loan.collateral_amount,
        );
        log(ClaimExpiredLoanReqEvent {
            loan_id,
            borrower: loan.borrower,
            collateral: loan.collateral,
            amount: loan.collateral_amount,
        });
    }
    #[payable, storage(read, write)]
    fn fill_loan_request(loan_id: u64) {
        require(!is_protocol_paused(), Error::EProtocolPaused);
        let mut loan = storage.loans.get(loan_id).read();
        require(loan.status == 0, Error::EInvalidStatus);
        require(
            loan.created_timestamp + get_req_expire_duration() > timestamp(),
            Error::EAlreadyExpired,
        );
        loan.lender = get_caller_address();
        loan.start_timestamp = timestamp();
        loan.status = 2; // magic number 2 is active (ref Enum at interface)
        storage.loans.insert(loan_id, loan);
        let amount = msg_amount();
        let asset_id: b256 = msg_asset_id().into();
        require(asset_id == loan.asset, Error::EInvalidAsset);
        require(amount == loan.asset_amount, Error::EInvalidAssetAmount);
        let asset_id: AssetId = get_asset_id_from_b256(loan.asset);
        let borrower_identity: Identity = get_identity_from_address(loan.borrower);
        transfer(borrower_identity, asset_id, loan.asset_amount);
        log(LoanFilledEvent {
            loan_id,
            borrower: loan.borrower,
            lender: get_caller_address(),
            asset: loan.asset,
            amount: loan.asset_amount,
            liquidation: loan.liquidation.liquidation_flag_internal,
        });
    }
    #[payable, storage(read, write)]
    fn repay_loan(loan_id: u64) {
        require(!is_protocol_paused(), Error::EProtocolPaused);
        let mut loan = storage.loans.get(loan_id).read();
        // loan must be active
        require(loan.status == 2, Error::EInvalidStatus);
        let interest_in_amount: u64 = loan.repayment_amount - loan.asset_amount;
        let protocol_fee: u64 = (interest_in_amount * get_protocol_fee()) / 10000;
        let amount_to_lender: u64 = loan.repayment_amount - protocol_fee;
        // status is 3 i.e repaid ref (enum at interface)
        loan.status = 3;
        storage.loans.insert(loan_id, loan);
        let amount = msg_amount();
        let asset_id: b256 = msg_asset_id().into();
        require(asset_id == loan.asset, Error::EInvalidAsset);
        require(amount == loan.repayment_amount, Error::EInvalidAssetAmount);
        let asset_id: AssetId = get_asset_id_from_b256(loan.asset);
        let lender_identity: Identity = get_identity_from_address(loan.lender);
        transfer(lender_identity, asset_id, amount_to_lender);
        let collateral_asset_id: AssetId = AssetId::from(loan.collateral);
        let borrower_identity: Identity = Identity::Address(loan.borrower);
        transfer(
            borrower_identity,
            collateral_asset_id,
            loan.collateral_amount,
        );
        let protocol_fee_receiver_identity = Identity::Address(get_protocol_fee_receiver());
        transfer(protocol_fee_receiver_identity, asset_id, protocol_fee);
        log(LoanRepaidEvent {
            loan_id,
            borrower: loan.borrower,
            lender: loan.lender,
            asset: loan.asset,
            repayment_amount: loan.repayment_amount,
        });
    }
    #[storage(read, write)]
    fn liquidate_loan(loan_id: u64) {
        require(!is_protocol_paused(), Error::EProtocolPaused);
        let mut loan = storage.loans.get(loan_id).read();
        // loan must be active
        require(loan.status == 2, Error::EInvalidStatus);
        let can_loan_be_liquidated = can_liquidate_loan(loan_id);
        if (can_loan_be_liquidated) {
            let protocol_fee = (loan.collateral_amount * get_protocol_liq_fee()) / 10000;
            let liquidator_amount = (loan.collateral_amount * get_liquidator_fee()) / 10000;
            let lender_amount = loan.collateral_amount - liquidator_amount - protocol_fee;
            loan.status = 4;
            storage.loans.insert(loan_id, loan);
            let collateral_asset_id: AssetId = get_asset_id_from_b256(loan.collateral);
            let lender_identity: Identity = get_identity_from_address(loan.lender);
            transfer(lender_identity, collateral_asset_id, lender_amount);
            transfer(
                msg_sender()
                    .unwrap(),
                collateral_asset_id,
                liquidator_amount,
            );
            let protocol_fee_receiver_identity: Identity = get_identity_from_address(get_protocol_fee_receiver());
            transfer(
                protocol_fee_receiver_identity,
                collateral_asset_id,
                protocol_fee,
            );
            log(LoanLiquidatedEvent {
                loan_id,
                borrower: loan.borrower,
                lender: loan.lender,
                collateral_amount: loan.collateral_amount,
            });
        }
    }

    #[storage(read)]
    fn get_price_from_oracle(feed_id: b256) -> u256 {
        get_price_from_oracle_internal(feed_id)
    }

    #[payable, storage(read)]
    fn pay_and_update_price_feeds(update_data: Vec<TemporalNumericValueInput>) {
        let stork_contract_id = storage.stork_contract.read();
        require(
            stork_contract_id != ContractId::zero(),
            Error::EOracleNotSet,
        );
        let stork_oracle_dispatcher = abi(Stork, stork_contract_id.bits());
        let stork_update_fee = stork_oracle_dispatcher.get_update_fee_v1(update_data);
        require(
            msg_amount() == stork_update_fee,
            Error::ENotEnoughForOracleUpdate,
        );
        stork_oracle_dispatcher
            .update_temporal_numeric_values_v1 {
                asset_id: msg_asset_id().bits(),
                coins: stork_update_fee,
            }(update_data);
    }

    #[storage(read)]
    fn get_loan(loan_id: u64) -> Loan {
        storage.loans.get(loan_id).read()
    }
    #[storage(read)]
    fn get_loan_status(loan_id: u64) -> u64 {
        storage.loans.get(loan_id).read().status
    }
    #[storage(read)]
    fn get_loan_length() -> u64 {
        storage.loan_length.read() - 1
    }
    #[storage(read)]
    fn is_loan_liquidation_by_oracle(loan_id: u64) -> bool {
        storage.loans.get(loan_id).read().liquidation.liquidation_flag_internal
    }
    #[storage(read)]
    fn protocol_status() -> bool {
        is_protocol_paused()
    }
    #[storage(read)]
    fn protocol_config() -> ProtocolConfig {
        storage.protocol_config.read()
    }

    fn get_protocol_owner() -> Address {
        PROTOCOL_OWNER
    }
    #[storage(read)]
    fn get_protocol_admin() -> Address {
        storage.protocol_admin.read()
    }
}
fn get_caller_address() -> Address {
    match msg_sender().unwrap() {
        Identity::Address(identity) => identity,
        _ => revert(0),
    }
}
fn get_asset_id_from_b256(asset: b256) -> AssetId {
    AssetId::from(asset)
}
fn get_identity_from_address(addr: Address) -> Identity {
    Identity::Address(addr)
}

fn only_protocol_owner() {
    require(
        Identity::Address(PROTOCOL_OWNER) == msg_sender()
            .unwrap(),
        Error::ENotProtocolOwner,
    );
}

#[storage(read)]
fn only_protocol_admin() {
    require(
        Identity::Address(storage.protocol_admin.read()) == msg_sender()
            .unwrap(),
        Error::ENotProtocolAdmin,
    );
}

#[storage(read)]
fn is_protocol_paused() -> bool {
    storage.is_paused.read()
}

#[storage(read)]
fn get_req_expire_duration() -> u64 {
    storage.protocol_config.time_request_loan_expires.read()
}

#[storage(read)]
fn get_protocol_fee_receiver() -> Address {
    storage.protocol_config.protocol_fee_receiver.read()
}

#[storage(read)]
fn get_protocol_fee() -> u64 {
    storage.protocol_config.protocol_fee.read()
}
#[storage(read)]
fn get_protocol_liq_fee() -> u64 {
    storage.protocol_config.protocol_liquidation_fee.read()
}
#[storage(read)]
fn get_liquidator_fee() -> u64 {
    storage.protocol_config.liquidator_fee.read()
}

#[storage(read)]
fn get_oracle_max_stale() -> u64 {
    storage.protocol_config.oracle_max_stale.read()
}

#[storage(read)]
fn get_min_loan_duration() -> u64 {
    storage.protocol_config.min_loan_duration.read()
}

#[storage(read)]
fn can_liquidate_loan(loan_id: u64) -> bool {
    let loan = storage.loans.get(loan_id).read();
    if (timestamp() > loan.start_timestamp + loan.duration) {
        return true
    }

    if (loan.liquidation.liquidation_flag_internal) {
        return check_can_liquidate_based_on_price_ratio_change(loan_id)
    }
    return false
}

#[storage(read)]
fn check_can_liquidate_based_on_price_ratio_change(loan_id: u64) -> bool {
    let loan = storage.loans.get(loan_id).read();

    let collateral_oracle_id: b256 = storage.oracle_config.get(loan.collateral).try_read().unwrap_or(b256::zero());
    let asset_oracle_id: b256 = storage.oracle_config.get(loan.asset).try_read().unwrap_or(b256::zero());

    require(
        collateral_oracle_id != b256::zero(),
        Error::EOralceCollateralNotSet,
    );
    require(asset_oracle_id != b256::zero(), Error::EOralceAssetNotSet);

    let liquidation_bps_u64: u64 = u64::from(10000u64);
    let liquidation_bps_u256: u256 = liquidation_bps_u64.as_u256();

    let src20_dispatcher_collateral = abi(SRC20, loan.collateral);
    let collateral_asset_id = get_asset_id_from_b256(loan.collateral);
    let collateral_decimal: u8 = src20_dispatcher_collateral.decimals(collateral_asset_id).unwrap();
    let collateral_decimal_in_u32: u32 = collateral_decimal.as_u32();

    let src20_dispatcher_asset = abi(SRC20, loan.asset);
    let asset_id = get_asset_id_from_b256(loan.asset);
    let asset_decimal: u8 = src20_dispatcher_asset.decimals(asset_id).unwrap();
    let asset_decimal_in_u32: u32 = asset_decimal.as_u32();

    let loan_asset_price_from_oracle: u256 = get_price_from_oracle_internal(asset_oracle_id);
    let collateral_asset_price_from_oracle: u256 = get_price_from_oracle_internal(collateral_oracle_id);

    let collateral_in_u256 = loan.collateral_amount.as_u256();
    let loan_in_u256 = loan.asset_amount.as_u256();

    let loan_in_usd = loan_in_u256 * loan_asset_price_from_oracle * u256::from(10_u64).pow(collateral_decimal_in_u32) * liquidation_bps_u256;
    let collateral_in_usd = collateral_in_u256 * collateral_asset_price_from_oracle * loan.liquidation.liquidation_threshold_in_bps.as_u256() * u256::from(10_u64).pow(asset_decimal_in_u32);
    if loan_in_usd > collateral_in_usd {
        return true
    } else {
        return false
    }
}

#[storage(read)]
fn get_price_from_oracle_internal(feed_id: b256) -> u256 {
    const TAI64_OFFSET: u64 = 4611686018427387914; // This is 2^62 + 10
    let stork_contract_id = storage.stork_contract.read();
    require(
        stork_contract_id != ContractId::zero(),
        Error::EOracleNotSet,
    );

    let stork_oracle_dispatcher = abi(Stork, stork_contract_id.bits());
    let oracle_result = stork_oracle_dispatcher.get_temporal_numeric_value_unchecked_v1(feed_id);

    let time_stamp = oracle_result.get_timestamp_ns();
    let quantized_value: I128 = oracle_result.get_quantized_value();

    require(quantized_value > I128::zero(), Error::EOraclePriceZero);

    let time_stamp_tai64 = time_stamp / 1_000_000_000 + TAI64_OFFSET;

    if (time_stamp_tai64 > timestamp()) {
        let time_elapsed_in_seconds = time_stamp_tai64 - timestamp();
        require(
            time_elapsed_in_seconds < get_oracle_max_stale(),
            Error::EOraclePriceStale,
        );
    } else {
        let time_elapsed_in_seconds = timestamp() - time_stamp_tai64;
        require(
            time_elapsed_in_seconds < get_oracle_max_stale(),
            Error::EOraclePriceStale,
        );
    }
    let price_U128 = quantized_value.underlying();
    price_U128.as_u256()
}

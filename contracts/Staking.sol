// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Staking is ERC721, Ownable {
    uint256 private _tokenId;
    uint256 private immutable HUNDRED_PC = 10 ** 5;
    uint8 private immutable tstPriceDec = 8;

    bool public active;                 // active or not, needs to be set manually

    uint256 public windowStart;         // the start time for the 'stake'
    uint256 public windowEnd;           // the end time for the 'stake'
    uint256 public maturity;            // the maturity date
    uint256 public allocatedSeuro;      // the amount of seuro allocated, inc rewards

    address public immutable TST_ADDRESS;
    address public immutable SEURO_ADDRESS;
    uint256 public immutable SI_RATE;   // simple interest rate for the bond (factor of 10 ** 5)
    uint256 public immutable minTST;    // the allowed minimum amount of TST to bond
    uint256 public immutable tstEUROsPrice;    // the allowed minimum amount of TST to bond

    mapping(address => Position) private _positions;

    struct Position { uint96 nonce; uint256 tokenId; bool open; uint256 stake; uint256 reward; bool burned; }

    event Mint(address indexed user, uint256 stake, uint256 allocatedSeuro);
    event Burn(address indexed user, uint256 stake, uint256 reward, uint256 allocatedSeuro);
    event Withdraw(address indexed user, uint256 amount);

    constructor(
        string memory _name, string memory _symbol, uint256 _start, uint256 _end, 
        uint256 _maturity, address _standardAddress, address _seuroAddress, uint256 _si,
        uint256 _tstEUROsPrice
    ) ERC721(_name, _symbol) Ownable(msg.sender) {
        SI_RATE = _si;
        TST_ADDRESS = _standardAddress;
        SEURO_ADDRESS = _seuroAddress;
        windowStart = _start;
        windowEnd = _end;
        maturity = _maturity;
        minTST = 1 ether;
        tstEUROsPrice = _tstEUROsPrice;
    }

    function activate() external onlyOwner { 
        require(active == false, "err-already-active");
        active = true;
    }

    function disable() external onlyOwner {
        require(active, "err-not-active");
        active = false;
    }

    // calculates the reward in SEURO based in the input of amount of TSTs
    function calculateReward(uint256 _amount) public view returns (uint256 reward) {
        uint256 tstReward = _amount * SI_RATE / HUNDRED_PC;
        return tstReward * tstEUROsPrice / 10 ** tstPriceDec;
    }

    // fetches the balance of the contract for the give erc20 token
    function balance(address _address) public view returns (uint256) { return IERC20(_address).balanceOf(address(this)); }

    // fetches the remaining about of tokens in the contract
    function remaining(address _address) public view returns (uint256) { return balance(_address) - allocatedSeuro; }

    // Main API to begin staking
    function mint(uint256 _amount) external {
        require(active == true, "err-not-active");
        require(_amount >= minTST, "err-not-min");
        require(block.timestamp >= windowStart, "err-not-started");
        require(block.timestamp < windowEnd, "err-finished");

        // calculate the reward so we can also update the remaining SEURO
        uint256 reward = calculateReward(_amount);
        require(remaining(SEURO_ADDRESS) >= reward, "err-overlimit");

        // Transfer funds from sender to this contract
        // TODO send to some other guy not this contract!

        IERC20(TST_ADDRESS).transferFrom(msg.sender, address(this), _amount);

        Position memory pos = _positions[msg.sender];
        require(pos.burned == false, "err-already-claimed");

        if (pos.nonce == 0) {
            _mint(msg.sender, ++_tokenId);

            pos.open = true;
            pos.tokenId = _tokenId;
        }

        // update the position
        pos.stake += _amount;
        pos.nonce += 1;
        pos.reward += reward;

        // update the position
        _positions[msg.sender] = pos;

        // update the rewards in SEUR to be paid out
        allocatedSeuro += reward;

        emit Mint(msg.sender, _amount, allocatedSeuro);
    }

    function burn() external {
        require(block.timestamp >= maturity, "err-maturity");

        Position storage pos = _positions[msg.sender];
        require(pos.nonce > 0, "err-not-valid");
        require(pos.open == true, "err-closed");

        // burn the token
        _burn(pos.tokenId);

        // transfer stake
        IERC20(TST_ADDRESS).transfer(msg.sender, pos.stake);
        // transfer reward
        IERC20(SEURO_ADDRESS).transfer(msg.sender, pos.reward);

        // update position states
        pos.open = false;
        pos.burned = true;

        allocatedSeuro -= pos.reward;

        emit Burn(msg.sender, pos.stake, pos.reward, allocatedSeuro);
    }

    // withdraw to the owner's address
    function withdraw(address _address) external onlyOwner {
        uint256 bal = IERC20(_address).balanceOf(address(this));

        require(bal > 0, "err-no-funds");
        IERC20(_address).transfer(owner(), bal);

        emit Withdraw(_address, bal);
    }

    function position(address owner) external view returns (Position memory) { return _positions[owner]; }
}

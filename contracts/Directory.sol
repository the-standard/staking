// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Directory is Ownable {

    address[] public entries;

    constructor() Ownable(msg.sender) {}

    function addUniqueStakingContract(address _contract) private {
        for (uint256 i = 0; i < entries.length; i++) if (entries[i] == _contract) revert("err-contract-added");
        entries.push(_contract);
    }

    function add(address _address) external onlyOwner {
        addUniqueStakingContract(_address);
    }

    function deleteEntry(uint256 index) private {
        for (uint256 i = index; i < entries.length - 1; i++) entries[i] = entries[i+1];
        entries.pop();
    }

    function del(address _address) external onlyOwner {
        for (uint256 i = 0; i < entries.length; i++) if (entries[i] == _address) deleteEntry(i);
    }

    function list() external view returns (address[] memory) {
        return entries;
    }
}

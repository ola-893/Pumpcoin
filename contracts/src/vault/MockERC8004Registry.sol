// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Simulation registry with actual ERC721 ownership/transfer semantics.
/// @dev Registration/ownerOf are interface-compatible with agent identity lookup;
/// this mock is not a deployed/full ERC8004 registry or reputation implementation.
/// Controller metadata is provenance only, never vault authority.
contract MockERC8004Registry is ERC721 {
    mapping(uint256 => address) public controllerOf;
    mapping(uint256 => bytes32) public metadataHashOf;
    uint256 public nextId = 1;
    event Registered(uint256 indexed agentId, address indexed owner, address indexed controller);
    event ControllerRotated(uint256 indexed agentId, address indexed oldController, address indexed newController);
    event MetadataUpdated(uint256 indexed agentId, bytes32 metadataHash);
    constructor() ERC721("Simulation Agent Identity", "SAI") {}

    function register(address controller) public returns (uint256 agentId) {
        require(controller != address(0), "controller");
        agentId = nextId++;
        _mint(msg.sender, agentId);
        controllerOf[agentId] = controller;
        emit Registered(agentId, msg.sender, controller);
    }

    function register() external returns (uint256) {
        return register(msg.sender);
    }

    function transfer(uint256 agentId, address to) external {
        transferFrom(msg.sender, to, agentId);
    }

    function rotateController(uint256 agentId, address next) external {
        require(ownerOf(agentId) == msg.sender && next != address(0), "owner/controller");
        emit ControllerRotated(agentId, controllerOf[agentId], next);
        controllerOf[agentId] = next;
    }

    function setMetadata(uint256 agentId, bytes32 h) external {
        require(ownerOf(agentId) == msg.sender, "not-owner");
        metadataHashOf[agentId] = h;
        emit MetadataUpdated(agentId, h);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address previous = super._update(to, tokenId, auth);
        if (previous != address(0) && previous != to) controllerOf[tokenId] = address(0);
        return previous;
    }
}

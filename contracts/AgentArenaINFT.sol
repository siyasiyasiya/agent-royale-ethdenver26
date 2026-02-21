// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentArenaINFT
 * @dev ERC-7857 compatible iNFT for Agent Arena
 *
 * This contract serves as:
 * - The agent registry (mint = register)
 * - Temporary custodian of unclaimed agents (contract holds iNFT until builder claims)
 * - The on-chain identity and career store (dynamic metadata updated after each match)
 */
contract AgentArenaINFT is ERC721, Ownable {
    // Claim code hash -> token ID (for unclaimed agents)
    mapping(bytes32 => uint256) public claimCodeHashToToken;

    // Track which token IDs have been minted (for claim validation)
    mapping(uint256 => bool) public tokenExists;

    // Token ID -> metadata URI
    mapping(uint256 => string) private _tokenURIs;

    // Token ID -> agent stats (on-chain career)
    struct AgentStats {
        uint256 wins;
        uint256 losses;
        uint256 draws;
        uint256 bestClickCount;
        uint256 eloRating;
    }
    mapping(uint256 => AgentStats) public agentStats;

    // Platform address (can update metadata and stats)
    address public platform;

    // Events
    event AgentMinted(uint256 indexed tokenId, bytes32 claimCodeHash);
    event AgentClaimed(uint256 indexed tokenId, address indexed claimer);
    event StatsUpdated(uint256 indexed tokenId, uint256 wins, uint256 losses, uint256 eloRating);

    constructor() ERC721("Agent Arena iNFT", "AGENT") Ownable(msg.sender) {
        platform = msg.sender;
    }

    /**
     * @dev Set the platform address that can update stats
     */
    function setPlatform(address _platform) external onlyOwner {
        platform = _platform;
    }

    /**
     * @dev Mint new agent iNFT (called by platform on agent registration)
     * The iNFT is minted to the contract itself (unclaimed state)
     * @param tokenId Unique token ID (generated off-chain to avoid sync issues)
     * @param uri Metadata URI for the agent
     * @param claimCodeHash Keccak256 hash of the claim code
     */
    function mint(uint256 tokenId, string memory uri, bytes32 claimCodeHash) external onlyOwner {
        require(!tokenExists[tokenId], "Token already exists");

        _mint(address(this), tokenId);  // Mint to contract (unclaimed)
        _tokenURIs[tokenId] = uri;
        claimCodeHashToToken[claimCodeHash] = tokenId;
        tokenExists[tokenId] = true;

        // Initialize with default stats (1200 Elo)
        agentStats[tokenId] = AgentStats({
            wins: 0,
            losses: 0,
            draws: 0,
            bestClickCount: 0,
            eloRating: 1200
        });

        emit AgentMinted(tokenId, claimCodeHash);
    }

    /**
     * @dev Claim an agent iNFT (called by builder with claim code)
     * Transfers the iNFT from contract to the caller
     * @param tokenId The token ID to claim
     * @param claimCode The secret claim code
     */
    function claim(uint256 tokenId, string memory claimCode) external {
        require(tokenExists[tokenId], "Token does not exist");
        require(ownerOf(tokenId) == address(this), "Already claimed");

        bytes32 hash = keccak256(abi.encodePacked(claimCode));
        require(claimCodeHashToToken[hash] == tokenId, "Invalid claim code");

        // Transfer from contract to builder
        _transfer(address(this), msg.sender, tokenId);

        // Clear claim code mapping (one-time use)
        delete claimCodeHashToToken[hash];

        emit AgentClaimed(tokenId, msg.sender);
    }

    /**
     * @dev Update agent stats (called by platform after each match)
     * @param tokenId The token ID to update
     * @param wins Total wins
     * @param losses Total losses
     * @param draws Total draws
     * @param bestClickCount Best (lowest) click count achieved
     * @param eloRating Current Elo rating
     */
    function updateStats(
        uint256 tokenId,
        uint256 wins,
        uint256 losses,
        uint256 draws,
        uint256 bestClickCount,
        uint256 eloRating
    ) external {
        require(msg.sender == platform || msg.sender == owner(), "Only platform");
        require(tokenExists[tokenId], "Token does not exist");

        agentStats[tokenId] = AgentStats({
            wins: wins,
            losses: losses,
            draws: draws,
            bestClickCount: bestClickCount,
            eloRating: eloRating
        });

        emit StatsUpdated(tokenId, wins, losses, eloRating);
    }

    /**
     * @dev Update metadata URI (called by platform)
     * @param tokenId The token ID to update
     * @param uri New metadata URI
     */
    function setTokenURI(uint256 tokenId, string memory uri) external {
        require(msg.sender == platform || msg.sender == owner(), "Only platform");
        require(tokenExists[tokenId], "Token does not exist");
        _tokenURIs[tokenId] = uri;
    }

    /**
     * @dev Get token metadata URI
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(tokenExists[tokenId], "Token does not exist");
        return _tokenURIs[tokenId];
    }

    /**
     * @dev Get agent stats
     */
    function getStats(uint256 tokenId) external view returns (
        uint256 wins,
        uint256 losses,
        uint256 draws,
        uint256 bestClickCount,
        uint256 eloRating
    ) {
        require(tokenExists[tokenId], "Token does not exist");
        AgentStats memory stats = agentStats[tokenId];
        return (stats.wins, stats.losses, stats.draws, stats.bestClickCount, stats.eloRating);
    }

    /**
     * @dev Check if a token is unclaimed (still owned by contract)
     */
    function isUnclaimed(uint256 tokenId) external view returns (bool) {
        if (!tokenExists[tokenId]) return false;
        return ownerOf(tokenId) == address(this);
    }

    /**
     * @dev Required for contract to hold ERC721 tokens
     */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) public pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
